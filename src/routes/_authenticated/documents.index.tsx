import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FolderOpen, Search, Pencil, X, Trash2, Loader2, Plus, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { DocumentViewer } from "@/components/document-viewer";
import { useProfileBundle } from "@/hooks/use-profile";
import { useDocumentsList } from "@/hooks/use-documents";
import { useDocumentTypes } from "@/hooks/use-document-types";
import { useAllowedDocumentTypeIds } from "@/hooks/use-allowed-document-types";
import { useCompanies } from "@/hooks/use-companies";
import { useDocumentTypeFields } from "@/hooks/use-document-type-fields";
import { Label } from "@/components/ui/label";
import { deleteDocumentFromDrive } from "@/lib/drive.functions";

import { formatBytes, type DocumentRow } from "@/lib/documents";

export const Route = createFileRoute("/_authenticated/documents/")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const navigate = useNavigate();
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const { data: allTypes = [] } = useDocumentTypes(orgId);
  const { data: companies = [] } = useCompanies(orgId);
  const { data: allowedTypeIds = null } = useAllowedDocumentTypeIds();

  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState<string>("all");
  const [companyId, setCompanyId] = useState<string>("all");

  // Restrict types to allowed ones AND to the selected company.
  const types = allTypes
    .filter((t) => allowedTypeIds === null || allowedTypeIds.includes(t.id))
    .filter((t: any) =>
      companyId === "all" ? true : t.company_id === companyId,
    );
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [activeFieldKeys, setActiveFieldKeys] = useState<string[]>([]);
  const [preview, setPreview] = useState<DocumentRow | null>(null);
  const [toDelete, setToDelete] = useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const queryClient = useQueryClient();
  const deleteFn = useServerFn(deleteDocumentFromDrive);

  const isViewer =
    !!profile &&
    profile.roles.length > 0 &&
    profile.roles.every((r) => r === "viewer");
  const canDelete = !isViewer;

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteFn({ data: { documentId: toDelete.id } });
      toast.success("Documento excluído");
      if (preview?.id === toDelete.id) setPreview(null);
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir");
    } finally {
      setDeleting(false);
    }
  }

  const { data: typeFields = [] } = useDocumentTypeFields(
    typeId !== "all" ? typeId : null,
  );


  const { data: docs = [], isLoading } = useDocumentsList({
    orgId,
    status: "all",
    typeId,
    search: search.length >= 2 ? search : "",
    allowedTypeIds,
  });

  const activeFieldFilters = Object.entries(fieldFilters).filter(
    ([, v]) => v.trim() !== "",
  );

  const filtersSelected = companyId !== "all" && typeId !== "all";

  const filteredDocs = !filtersSelected
    ? []
    : docs.filter((d: any) => {
        if (companyId !== "all" && d.company_id !== companyId) return false;
        if (activeFieldFilters.length > 0) {
          const fv = (d.field_values ?? {}) as Record<string, unknown>;
          for (const [key, val] of activeFieldFilters) {
            const docVal = String(fv[key] ?? "").toLowerCase();
            if (!docVal.includes(val.trim().toLowerCase())) return false;
          }
        }
        return true;
      });

  const typeName = (id: string | null) =>
    id ? allTypes.find((t) => t.id === id)?.name ?? "—" : "—";
  const companyName = (id: string | null | undefined) =>
    id ? companies.find((c) => c.id === id)?.name ?? "—" : "—";



  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-display font-bold tracking-tight flex items-center gap-2">
              <FolderOpen className="h-7 w-7 text-primary" /> Documentos
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestão eletrônica de documentos processados.
            </p>
          </header>

          <Card className="p-4 flex flex-wrap gap-3">
            <Select
              value={companyId}
              onValueChange={(v) => {
                setCompanyId(v);
                setTypeId("all");
                setFieldFilters({});
                setActiveFieldKeys([]);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={typeId}
              onValueChange={(v) => {
                setTypeId(v);
                setFieldFilters({});
                setActiveFieldKeys([]);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>

          {typeId !== "all" && typeFields.length > 0 && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-medium">Filtrar pelos campos do tipo</h3>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Plus className="h-4 w-4 mr-1" /> Adicionar filtro
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
                      {typeFields.filter((f) => !activeFieldKeys.includes(f.field_key)).length === 0 ? (
                        <DropdownMenuItem disabled>Nenhum campo disponível</DropdownMenuItem>
                      ) : (
                        typeFields
                          .filter((f) => !activeFieldKeys.includes(f.field_key))
                          .map((f) => (
                            <DropdownMenuItem
                              key={f.id}
                              onSelect={() =>
                                setActiveFieldKeys((prev) => [...prev, f.field_key])
                              }
                            >
                              {f.label}
                            </DropdownMenuItem>
                          ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {activeFieldKeys.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setActiveFieldKeys([]);
                        setFieldFilters({});
                      }}
                    >
                      Limpar
                    </Button>
                  )}
                </div>
              </div>
              {activeFieldKeys.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Clique em "Adicionar filtro" para escolher os campos da indexação que deseja usar na pesquisa.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeFieldKeys
                    .map((k) => typeFields.find((f) => f.field_key === k))
                    .filter((f): f is NonNullable<typeof f> => !!f)
                    .map((f) => {
                      const val = fieldFilters[f.field_key] ?? "";
                      const set = (v: string) =>
                        setFieldFilters((prev) => ({ ...prev, [f.field_key]: v }));
                      const remove = () => {
                        setActiveFieldKeys((prev) =>
                          prev.filter((k) => k !== f.field_key),
                        );
                        setFieldFilters((prev) => {
                          const n = { ...prev };
                          delete n[f.field_key];
                          return n;
                        });
                      };
                      return (
                        <div key={f.id} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor={`ff-${f.id}`} className="text-xs">
                              {f.label}
                            </Label>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-5 w-5"
                              onClick={remove}
                              aria-label={`Remover filtro ${f.label}`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          {f.field_type === "select" && Array.isArray(f.options) ? (
                            <Select
                              value={val || "all"}
                              onValueChange={(v) => set(v === "all" ? "" : v)}
                            >
                              <SelectTrigger id={`ff-${f.id}`}>
                                <SelectValue placeholder="Todos" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                {(f.options as string[]).map((o) => (
                                  <SelectItem key={o} value={o}>
                                    {o}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={`ff-${f.id}`}
                              value={val}
                              onChange={(e) => set(e.target.value)}
                              type={
                                f.field_type === "number"
                                  ? "number"
                                  : f.field_type === "date"
                                  ? "date"
                                  : "text"
                              }
                              placeholder={`Filtrar ${f.label.toLowerCase()}`}
                            />
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </Card>
          )}

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  {typeId !== "all" &&
                    typeFields.map((f) => (
                      <TableHead key={f.id}>{f.label}</TableHead>
                    ))}
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead>Nome Arquivo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const colSpan =
                    4 + (typeId !== "all" ? typeFields.length : 0);
                  return (
                    <>
                      {!filtersSelected && (
                        <TableRow>
                          <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">
                            Selecione uma empresa e um tipo de documento para visualizar os resultados.
                          </TableCell>
                        </TableRow>
                      )}
                      {filtersSelected && isLoading && (
                        <TableRow>
                          <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">
                            Carregando...
                          </TableCell>
                        </TableRow>
                      )}
                      {filtersSelected && !isLoading && filteredDocs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">
                            Nenhum documento encontrado.
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })()}
                {filteredDocs.map((doc: any) => {
                  const fv = (doc.field_values ?? {}) as Record<string, unknown>;
                  const fmt = (v: unknown) => {
                    if (v === null || v === undefined || v === "") return "—";
                    if (typeof v === "boolean") return v ? "Sim" : "Não";
                    return String(v);
                  };
                  return (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer transition-colors"
                    data-state={preview?.id === doc.id ? "selected" : undefined}
                    onClick={() => setPreview(doc)}
                  >
                    {typeId !== "all" &&
                      typeFields.map((f) => (
                        <TableCell key={f.id} className="text-sm max-w-[200px] truncate">
                          {fmt(fv[f.field_key])}
                        </TableCell>
                      ))}
                    <TableCell className="text-sm">{formatBytes(Number(doc.size_bytes))}</TableCell>
                    <TableCell
                      className="text-sm text-muted-foreground"
                      title={format(new Date(doc.created_at), "PPPp", {
                        locale: ptBR,
                      })}
                    >
                      {format(new Date(doc.created_at), "dd/MM/yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="font-medium max-w-[260px] truncate">{doc.name}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({ to: "/documents/$id", params: { id: doc.id } });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setToDelete(doc);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

        </div>
      </div>


      {preview && (
        <aside className="w-[480px] border-l border-border flex flex-col bg-background shrink-0">
          <div className="flex items-center justify-between p-3 border-b border-border bg-card">
            <h2 className="font-medium text-sm">Pré-visualização</h2>
            <Button size="icon" variant="ghost" onClick={() => setPreview(null)} className="h-7 w-7">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 relative">
            <DocumentViewer doc={preview} />
          </div>
        </aside>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && !deleting && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.name} será removido do Google Drive e seus metadados (campos, tags e histórico) serão apagados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
