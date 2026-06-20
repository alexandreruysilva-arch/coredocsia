import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { FileType, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-stub";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useProfileBundle } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/cadastro/tipo-documento")({
  component: TipoDocumentoPage,
});

const schema = z.object({
  company_id: z.string().uuid("Selecione a empresa"),
  name: z.string().trim().min(1, "Informe o nome").max(150),
  slug: z.string().trim().max(150).optional().or(z.literal("")),
});
type FormVals = z.infer<typeof schema>;

interface CompanyOpt {
  id: string;
  name: string;
}
interface DocTypeRow {
  id: string;
  org_id: string;
  company_id: string | null;
  name: string;
  slug: string;
  created_at: string;
}

const emptyForm: FormVals = { company_id: "", name: "", slug: "" };

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function TipoDocumentoPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const queryClient = useQueryClient();

  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DocTypeRow | null>(null);
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

  const list = useQuery({
    queryKey: ["doc-types", orgId, selectedCompany],
    enabled: !!orgId && !!selectedCompany,
    queryFn: async (): Promise<DocTypeRow[]> => {
      const { data, error } = await supabase
        .from("document_types")
        .select("*")
        .eq("org_id", orgId!)
        .eq("company_id", selectedCompany)
        .order("name");
      if (error) throw error;
      return (data ?? []) as DocTypeRow[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (payload: FormVals) => {
      if (!orgId) throw new Error("Organização não selecionada");
      const slug = (payload.slug?.trim() || slugify(payload.name)) || slugify(payload.name);
      const row = {
        org_id: orgId,
        company_id: payload.company_id,
        name: payload.name.trim(),
        slug,
      };
      if (editing) {
        const { error } = await supabase
          .from("document_types")
          .update(row)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("document_types").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Tipo atualizado" : "Tipo cadastrado");
      queryClient.invalidateQueries({ queryKey: ["doc-types"] });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("document_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tipo removido");
      queryClient.invalidateQueries({ queryKey: ["doc-types"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const companyName = useMemo(
    () => companies.data?.find((c) => c.id === selectedCompany)?.name ?? "",
    [companies.data, selectedCompany],
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, company_id: selectedCompany });
    setErrors({});
    setOpen(true);
  }
  function openEdit(r: DocTypeRow) {
    setEditing(r);
    setForm({ company_id: r.company_id ?? "", name: r.name, slug: r.slug });
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
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: Partial<Record<keyof FormVals, string>> = {};
      parsed.error.issues.forEach((i) => {
        fe[i.path[0] as keyof FormVals] = i.message;
      });
      setErrors(fe);
      return;
    }
    upsert.mutate(parsed.data);
  }

  const hasCompanies = (companies.data?.length ?? 0) > 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Tipo Documento"
        description="Cadastre tipos de documento por empresa."
        actions={
          <Button onClick={openCreate} disabled={!selectedCompany}>
            <Plus className="h-4 w-4 mr-2" /> Novo tipo
          </Button>
        }
      />

      <div className="mb-4 max-w-md space-y-1.5">
        <Label>Empresa</Label>
        <Select value={selectedCompany} onValueChange={setSelectedCompany}>
          <SelectTrigger>
            <SelectValue
              placeholder={hasCompanies ? "Selecione a empresa" : "Cadastre uma empresa primeiro"}
            />
          </SelectTrigger>
          <SelectContent>
            {(companies.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!selectedCompany ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-12 text-sm text-muted-foreground">
                  Selecione uma empresa para visualizar seus tipos de documento.
                </TableCell>
              </TableRow>
            ) : list.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 3 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (list.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-12">
                  <div className="mx-auto h-12 w-12 rounded-lg bg-accent grid place-items-center mb-3">
                    <FileType className="h-6 w-6 text-accent-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Nenhum tipo cadastrado para {companyName}.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              (list.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.slug}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remover "${r.name}"?`)) remove.mutate(r.id);
                        }}
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
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
            <DialogTitle>{editing ? "Editar tipo" : "Novo tipo de documento"}</DialogTitle>
            <DialogDescription>
              Cada empresa pode ter vários tipos de documento.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empresa *</Label>
              <Select
                value={form.company_id}
                onValueChange={(v) => setForm((f) => ({ ...f, company_id: v }))}
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
              {errors.company_id && (
                <p className="text-xs text-destructive">{errors.company_id}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome do Tipo *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value,
                    slug: editing ? f.slug : slugify(e.target.value),
                  }))
                }
                autoFocus
                placeholder="Ex.: Nota Fiscal"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="nota-fiscal"
              />
              {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
