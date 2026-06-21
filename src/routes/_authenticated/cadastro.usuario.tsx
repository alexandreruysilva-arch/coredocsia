import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
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
import {
  inviteUserAccess,
  listOrgUserAccess,
  updateUserAccess,
} from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/cadastro/usuario")({
  component: UsuarioPage,
});

const formSchema = z.object({
  email: z.string().email("E-mail inválido"),
  fullName: z.string().trim().min(1, "Informe o nome").max(150),
  password: z.string().max(72).optional().or(z.literal("")),
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
}
interface AccessItem {
  id: string;
  user_id: string;
  company_id: string;
  document_type_id: string;
  company_name: string;
  document_type_name: string;
  full_name: string;
  email: string | null;
}
interface EditingCtx {
  userId: string;
  companyId: string;
}

const emptyForm: FormVals = {
  email: "",
  fullName: "",
  password: "",
  companyId: "",
  documentTypeIds: [],
};

function UsuarioPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const queryClient = useQueryClient();
  const inviteFn = useServerFn(inviteUserAccess);
  const updateFn = useServerFn(updateUserAccess);
  const listFn = useServerFn(listOrgUserAccess);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EditingCtx | null>(null);
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
        .select("id, name")
        .eq("company_id", form.companyId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const access = useQuery({
    queryKey: ["user-access", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<AccessItem[]> => {
      const res = await listFn();
      return res as unknown as AccessItem[];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        userId: string;
        companyId: string;
        name: string;
        email: string | null;
        companyName: string;
        types: { id: string; documentTypeId: string; name: string }[];
      }
    >();
    (access.data ?? []).forEach((r) => {
      const key = `${r.user_id}:${r.company_id}`;
      const entry = map.get(key) ?? {
        userId: r.user_id,
        companyId: r.company_id,
        name: r.full_name,
        email: r.email,
        companyName: r.company_name,
        types: [],
      };
      entry.types.push({
        id: r.id,
        documentTypeId: r.document_type_id,
        name: r.document_type_name,
      });
      map.set(key, entry);
    });
    return Array.from(map.values());
  }, [access.data]);

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
      toast.success("Usuário cadastrado");
      queryClient.invalidateQueries({ queryKey: ["user-access", orgId] });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (vals: FormVals) => {
      if (!editing) throw new Error("Sem contexto de edição");
      return updateFn({
        data: {
          userId: editing.userId,
          fullName: vals.fullName.trim(),
          companyId: vals.companyId,
          documentTypeIds: vals.documentTypeIds,
        },
      });
    },
    onSuccess: () => {
      toast.success("Usuário atualizado");
      queryClient.invalidateQueries({ queryKey: ["user-access", orgId] });
      closeDialog();
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

  // When editing and docTypes (re)loads for the selected company,
  // make sure all already-granted ids are kept selected even if
  // the docType list arrives after we open the dialog.
  useEffect(() => {
    if (!editing || !docTypes.data) return;
    setForm((f) => {
      const valid = new Set(docTypes.data!.map((d) => d.id));
      const filtered = f.documentTypeIds.filter((id) => valid.has(id));
      return filtered.length === f.documentTypeIds.length ? f : { ...f, documentTypeIds: filtered };
    });
  }, [editing, docTypes.data]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setOpen(true);
  }

  function openEdit(g: (typeof grouped)[number]) {
    setEditing({ userId: g.userId, companyId: g.companyId });
    setForm({
      email: g.email ?? "",
      fullName: g.name,
      companyId: g.companyId,
      documentTypeIds: g.types.map((t) => t.documentTypeId),
    });
    setErrors({});
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
  }

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
    (editing ? update : invite).mutate(parsed.data);
  }

  function toggleType(id: string) {
    setForm((f) => ({
      ...f,
      documentTypeIds: f.documentTypeIds.includes(id)
        ? f.documentTypeIds.filter((x) => x !== id)
        : [...f.documentTypeIds, id],
    }));
  }

  const saving = invite.isPending || update.isPending;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Usuário"
        description="Cadastre usuários e vincule a empresa e tipos de documento."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Novo usuário
          </Button>
        }
      />

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Tipos de Documento</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {access.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : grouped.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
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
                <TableRow key={`${g.userId}-${g.companyId}`}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="text-muted-foreground">{g.email ?? "—"}</TableCell>
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
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(g)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeDialog())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Atualize o nome e os tipos de documento liberados para este usuário."
                : "O usuário receberá um convite por e-mail e poderá acessar os tipos selecionados."}
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
                disabled={!!editing}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Empresa *</Label>
              <Select
                value={form.companyId}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    companyId: v,
                    documentTypeIds: editing && v === editing.companyId ? f.documentTypeIds : [],
                  }))
                }
                disabled={!!editing}
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
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
