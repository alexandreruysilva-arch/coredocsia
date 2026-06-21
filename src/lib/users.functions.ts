import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(1).max(150),
  companyId: z.string().uuid(),
  documentTypeIds: z.array(z.string().uuid()).min(1),
});

/**
 * Creates (or reuses) a user and grants them access to the selected
 * document types of a company within the current organization.
 */
export const inviteUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve current org from caller's profile.
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("current_org_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    const orgId = profile?.current_org_id;
    if (!orgId) throw new Error("Organização atual não definida");

    // Verify company belongs to org and document types belong to company.
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id, org_id")
      .eq("id", data.companyId)
      .maybeSingle();
    if (companyErr) throw new Error(companyErr.message);
    if (!company || company.org_id !== orgId) {
      throw new Error("Empresa inválida");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find or create user in auth.
    let targetUserId: string | null = null;
    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (list.error) throw new Error(list.error.message);
    const found = list.data.users.find(
      (u) => u.email?.toLowerCase() === data.email.toLowerCase(),
    );
    if (found) {
      targetUserId = found.id;
    } else {
      const created = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        data: { full_name: data.fullName },
      });
      if (created.error || !created.data.user) {
        throw new Error(created.error?.message ?? "Falha ao convidar usuário");
      }
      targetUserId = created.data.user.id;
    }

    // Ensure profile row exists.
    await supabaseAdmin.from("profiles").upsert(
      { id: targetUserId, full_name: data.fullName, current_org_id: orgId },
      { onConflict: "id" },
    );

    // Ensure membership in current org.
    await supabaseAdmin
      .from("organization_members")
      .upsert({ org_id: orgId, user_id: targetUserId }, { onConflict: "org_id,user_id" });

    // Grant access rows.
    const rows = data.documentTypeIds.map((dt) => ({
      org_id: orgId,
      user_id: targetUserId!,
      company_id: data.companyId,
      document_type_id: dt,
    }));
    const { error: insertErr } = await supabaseAdmin
      .from("user_document_access")
      .upsert(rows, { onConflict: "user_id,company_id,document_type_id" });
    if (insertErr) throw new Error(insertErr.message);

    return { userId: targetUserId, granted: rows.length };
  });
