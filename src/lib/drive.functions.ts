import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Upload via multipart FormData: fields = file, documentId, name, documentTypeId?, tags (comma-sep)
export const uploadDocumentToDrive = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("FormData esperado");
    const file = data.get("file");
    const documentId = data.get("documentId");
    if (!(file instanceof File)) throw new Error("Arquivo ausente");
    if (typeof documentId !== "string") throw new Error("documentId ausente");
    return { file, documentId };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { file, documentId } = data;

    if (!userId) throw new Error("Usuário não autenticado");

    const { ensureOrgFolder, uploadFileToDrive } = await import("./drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load doc + verify ownership via RLS-authed client
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, org_id, status")
      .eq("id", documentId)
      .single();
    if (docErr || !doc) throw new Error("Documento não encontrado ou sem acesso");

    // Get/create org folder
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, drive_folder_id")
      .eq("id", doc.org_id)
      .single();
    if (!org) throw new Error("Organização não encontrada");

    let folderId = org.drive_folder_id;
    if (!folderId) {
      folderId = await ensureOrgFolder(org.id, org.name);
      await supabaseAdmin.from("organizations").update({ drive_folder_id: folderId }).eq("id", org.id);
    }

    const buffer = await file.arrayBuffer();
    try {
      const uploaded = await uploadFileToDrive({
        folderId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        body: buffer,
        appProperties: { lovableDocumentId: documentId, lovableOrgId: doc.org_id, uploadedBy: userId },
      });

      const { data: final, error: updErr } = await supabase
        .from("documents")
        .update({
          status: "processed",
          drive_file_id: uploaded.id,
          drive_web_view_link: uploaded.webViewLink ?? null,
          storage_path: null,
        })
        .eq("id", documentId)
        .select("*")
        .single();
      if (updErr || !final) throw updErr ?? new Error("Falha ao finalizar documento");
      return final;
    } catch (err) {
      await supabase
        .from("documents")
        .update({ status: "failed", error_message: err instanceof Error ? err.message : String(err) })
        .eq("id", documentId);
      throw err;
    }
  });

export const deleteDocumentFromDrive = createServerFn({ method: "POST" })
  .inputValidator((data: { documentId: string }) => {
    if (!data || typeof data.documentId !== "string") throw new Error("documentId ausente");
    return data;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (!userId) throw new Error("Usuário não autenticado");
    const { deleteDriveFile } = await import("./drive.server");
    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, drive_file_id")
      .eq("id", data.documentId)
      .single();
    if (error || !doc) throw new Error("Documento não encontrado");
    if (doc.drive_file_id) {
      try {
        await deleteDriveFile(doc.drive_file_id);
      } catch (e) {
        console.error("drive delete failed", e);
      }
    }
    const { error: delErr } = await supabase.from("documents").delete().eq("id", data.documentId);
    if (delErr) throw delErr;
    return { ok: true };
  });
