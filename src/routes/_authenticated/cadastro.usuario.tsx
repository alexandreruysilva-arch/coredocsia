import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-stub";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useProfileBundle } from "@/hooks/use-profile";
import { inviteUserAccess } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/cadastro/usuario")({
  component: UsuarioPage,
});

const formSchema = z.object({
  email: z.string().email("E-mail inválido"),
  fullName: z.string().trim().min(1, "Informe o nome").max(150),
  companyId: z.string().uuid("Selecione a empresa"),
  documentTypeIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um tipo"),
});
type FormVals = z.infer<typeof formSchema>;

interface CompanyOpt {
  id: string;
  name: string;
}
interface DocTypeOpt {
  id: string;
  name: string;
  company_id: string | null;
}
interface AccessRow {
  id: string;
  user_id: string;
  company_id: string;
  document_type_id: string;
  companies: { name: string } | null;
  document_types: { name: string } | null;
}

const emptyForm: FormVals = {
  email: "",
  fullName: "",
  companyId: "",
  documentTypeIds: [],
};

function UsuarioPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const queryClient = useQueryClient();
  const inviteFn = useServerFn(inviteUserAccess);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormVals>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormVals, string>>>({});

  const companies = useQuery({
    queryKey: ["companies-min", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CompanyOpt[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("org_id", orgId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const docTypes = useQuery({
    queryKey: ["doc-types-for-company", form.companyId],
    enabled: !!form.companyId,
    queryFn: async (): Promise<DocTypeOpt[]> => {
      const { data, error } = await supabase
        .from("document_types")
        .select("id, name, company_id")
        .eq("company_id", form.companyId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const access = useQuery({
    queryKey: ["user-access", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<AccessRow[]> => {
      const { data, error } = await supabase
        .from("user_document_access")
        .select(
          "id, user_id, company_id, document_type_id, companies(name), document_types(name)",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AccessRow[];
    },
  });

  const userIds = useMemo(
    () => Array.from(new Set((access.data ?? []).map((r) => r.user_id))),
    [access.data],
  );

  const profiles = useQuery({
    queryKey: ["profiles-by-ids", userIds],
    enabled: userIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((p) => {
        map[p.id] = p.full_name ?? "—";
      });
      return map;
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { userId: string; name: string; companyName: string; types: { id: string; name: string }[] }
    >();
    (access.data ?? []).forEach((r) => {
      const key = `${r.user_id}:${r.company_id}`;
      const entry = map.get(key) ?? {
        userId: r.user_id,
        name: profiles.data?.[r.user_id] ?? "—",
        companyName: r.companies?.name ?? "—",
        types: [] as { id: string; name: string }[],
      };
      entry.types.push({ id: r.id, name: r.document_types?.name ?? "—" });
      map.set(key, entry);
    });
    return Array.from(map.values());
  }, [access.data, profiles.data]);

  const invite = useMutation({
    mutationFn: async (vals: FormVals) =>
      inviteFn({
        data: {
          email: vals.email.trim(),
          fullName: vals.fullName.trim(),
          companyId: vals.companyId,
          documentTypeIds: vals.documentTypeIds,
        },
      }),
    onSuccess: () => {
      toast.success("Usuário cadastrado e acessos concedidos");
      queryClient.invalidateQueries({ queryKey: ["user-access", orgId] });
      setOpen(false);
      setForm(emptyForm);
      setErrors({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_document_access").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso revogado");
      queryClient.invalidateQueries({ queryKey: ["user-access", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      const fe: Partial<Record<keyof FormVals, string>> = {};
      parsed.error.issues.forEach((i) => {
        fe[i.path[0] as keyof FormVals] = i.message;
      });
      setErrors(fe);
      return;
    }
    invite.mutate(parsed.data);
  }

  function toggleType(id: string) {
    setForm((f) => ({
      ...f,
      documentTypeIds: f.documentTypeIds.includes(id)
        ? f.documentTypeIds.filter((x) => x !== id)
        : [...f.documentTypeIds, id],
    }));
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Usuário"
        description="Cadastre usuários e vincule a empresa e tipos de documento."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo usuário
          </Button>
        }
      />

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Tipos de Documento</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {access.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : grouped.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12">
                  <div className="mx-auto h-12 w-12 rounded-lg bg-accent grid place-items-center mb-3">
                    <Users className="h-6 w-6 text-accent-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Nenhum usuário cadastrado ainda.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              grouped.map((g) => (
                <TableRow key={`${g.userId}-${g.companyName}`}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="text-muted-foreground">{g.companyName}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {g.types.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 rounded-md bg-accent text-accent-foreground px-2 py-0.5 text-xs"
                        >
                          {t.name}
                          <button
                            type="button"
                            onClick={() => revoke.mutate(t.id)}
                            className="opacity-60 hover:opacity-100"
                            aria-label={`Revogar ${t.name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {g.types.length} tipo(s)
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setForm(emptyForm);
            setErrors({});
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>
              O usuário receberá um convite por e-mail e poderá acessar os tipos selecionados.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nome *</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                autoFocus
              />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Empresa *</Label>
              <Select
                value={form.companyId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, companyId: v, documentTypeIds: [] }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(companies.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.companyId && (
                <p className="text-xs text-destructive">{errors.companyId}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Tipos de Documento *</Label>
              <div className="rounded-md border p-3 max-h-48 overflow-auto space-y-2">
                {!form.companyId ? (
                  <p className="text-xs text-muted-foreground">
                    Selecione uma empresa para listar os tipos.
                  </p>
                ) : (docTypes.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum tipo cadastrado para esta empresa.
                  </p>
                ) : (
                  (docTypes.data ?? []).map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.documentTypeIds.includes(t.id)}
                        onCheckedChange={() => toggleType(t.id)}
                      />
                      {t.name}
                    </label>
                  ))
                )}
              </div>
              {errors.documentTypeIds && (
                <p className="text-xs text-destructive">{errors.documentTypeIds}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
