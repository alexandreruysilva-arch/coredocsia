import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FolderOpen, Search, Pencil, X, Trash2, Loader2, Plus, Info, Download } from "lucide-react";
import * as XLSX from "xlsx";
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}

function DocumentsPage() {
  const navigate = useNavigate();
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const { data: allTypes = [] } = useDocumentTypes(orgId);
  const { data: companies = [] } = useCompanies(orgId);
  const { data: allowedTypeIds = null } = useAllowedDocumentTypeIds();

  const FILTERS_KEY = "documents:filters:v1";
  const initialFilters = (() => {
    if (typeof window === "undefined") return { search: "", typeId: "all", companyId: "all", activeFieldKeys: [] as string[], fieldFilters: {} as Record<string, string> };
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY);
      if (!raw) return { search: "", typeId: "all", companyId: "all", activeFieldKeys: [] as string[], fieldFilters: {} as Record<string, string> };
      const p = JSON.parse(raw);
      return {
        search: typeof p.search === "string" ? p.search : "",
        typeId: typeof p.typeId === "string" ? p.typeId : "all",
        companyId: typeof p.companyId === "string" ? p.companyId : "all",
        activeFieldKeys: Array.isArray(p.activeFieldKeys) ? p.activeFieldKeys : [],
        fieldFilters: p.fieldFilters && typeof p.fieldFilters === "object" ? p.fieldFilters : {},
      };
    } catch {
      return { search: "", typeId: "all", companyId: "all", activeFieldKeys: [] as string[], fieldFilters: {} as Record<string, string> };
    }
  })();

  const [search, setSearch] = useState(initialFilters.search);
  const [typeId, setTypeId] = useState<string>(initialFilters.typeId);
  const [companyId, setCompanyId] = useState<string>(initialFilters.companyId);

  // Restrict types to allowed ones AND to the selected company.
  const types = allTypes
    .filter((t) => allowedTypeIds === null || allowedTypeIds.includes(t.id))
    .filter((t: any) =>
      companyId === "all" ? true : t.company_id === companyId,
    );
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>(initialFilters.fieldFilters);
  const [activeFieldKeys, setActiveFieldKeys] = useState<string[]>(initialFilters.activeFieldKeys);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({ search, typeId, companyId, activeFieldKeys, fieldFilters }),
      );
    } catch {}
  }, [search, typeId, companyId, activeFieldKeys, fieldFilters]);
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

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [companyId, typeId, search, JSON.stringify(fieldFilters)]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedDocs = filteredDocs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);


  // Map de uploader_id -> nome, para mostrar o operador que indexou.
  const uploaderIds = useMemo(
    () =>
      Array.from(
        new Set(pagedDocs.map((d: any) => d.uploaded_by).filter(Boolean)),
      ) as string[],
    [pagedDocs],
  );
  const { data: uploaderMap = {} } = useQuery({
    queryKey: ["profiles-by-ids", uploaderIds.sort().join(",")],
    enabled: uploaderIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", uploaderIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.id] = p.full_name ?? "—";
      return map;
    },
  });

  // Map de last_edited_by -> nome, para mostrar o último operador que editou.
  const editorIds = useMemo(
    () =>
      Array.from(
        new Set(pagedDocs.map((d: any) => d.last_edited_by).filter(Boolean)),
      ) as string[],
    [pagedDocs],
  );
  const { data: editorMap = {} } = useQuery({
    queryKey: ["profiles-by-ids", editorIds.sort().join(",")],
    enabled: editorIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", editorIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.id] = p.full_name ?? "—";
      return map;
    },
  });

  // Map de document_id -> total de tokens consumidos na extração por IA.
  const docIds = useMemo(
    () => Array.from(new Set(pagedDocs.map((d: any) => d.id))) as string[],
    [pagedDocs],
  );
  const { data: usageMap = {} } = useQuery({
    queryKey: ["ai-usage-by-docs", orgId, docIds.sort().join(",")],
    enabled: docIds.length > 0 && !!orgId,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("ai_usage_logs")
        .select("document_id, cost_brl")
        .eq("org_id", orgId!)
        .in("document_id", docIds)
        .eq("success", true);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        if (!row.document_id || row.cost_brl == null) continue;
        map[row.document_id] = (map[row.document_id] ?? 0) + Number(row.cost_brl);
      }
      return map;
    },
  });

  // Map de document_id -> tempo de processamento IA (ms).
  const { data: durationMap = {} } = useQuery({
    queryKey: ["ai-duration-by-docs", orgId, docIds.sort().join(",")],
    enabled: docIds.length > 0 && !!orgId,
    queryFn: async (): Promise<Record<string, number | null>> => {
      const { data, error } = await supabase
        .from("ai_usage_logs")
        .select("document_id, duration_ms")
        .eq("org_id", orgId!)
        .in("document_id", docIds)
        .eq("success", true);
      if (error) throw error;
      const map: Record<string, number | null> = {};
      for (const row of data ?? []) {
        if (!row.document_id) continue;
        const ms = row.duration_ms != null ? Number(row.duration_ms) : null;
        if (ms != null) map[row.document_id] = ms;
      }
      return map;
    },
  });





  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-6">
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-3 py-1 text-xs font-medium text-muted-foreground mb-3">
                <FolderOpen className="h-3.5 w-3.5 text-blue-800" />
                Gestão eletrônica
              </div>
              <h1 className="text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
                Documentos GED
              </h1>
              <p className="text-muted-foreground mt-2">
                Pesquise, filtre e gerencie todos os documentos processados.
              </p>
            </div>
          </header>


          {filtersSelected && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="p-4 border-0 bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/85 uppercase tracking-wider">Resultados</span>
                  <FolderOpen className="h-4 w-4 text-white/90" />
                </div>
                <p className="text-2xl font-display font-bold mt-2 tabular-nums">{filteredDocs.length}</p>
              </Card>
              <Card className="p-4 border-0 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/85 uppercase tracking-wider">Processados</span>
                  <Search className="h-4 w-4 text-white/90" />
                </div>
                <p className="text-2xl font-display font-bold mt-2 tabular-nums">
                  {filteredDocs.filter((d) => d.status === "processed").length}
                </p>
              </Card>
              <Card className="p-4 border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/85 uppercase tracking-wider">Pendentes</span>
                  <Loader2 className="h-4 w-4 text-white/90" />
                </div>
                <p className="text-2xl font-display font-bold mt-2 tabular-nums">
                  {filteredDocs.filter((d) => d.status === "pending" || d.status === "processing").length}
                </p>
              </Card>
              <Card className="p-4 border-0 bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/85 uppercase tracking-wider">Falhas</span>
                  <X className="h-4 w-4 text-white/90" />
                </div>
                <p className="text-2xl font-display font-bold mt-2 tabular-nums">
                  {filteredDocs.filter((d) => d.status === "failed").length}
                </p>
              </Card>
            </div>
          )}

          <Card className="p-4 flex flex-wrap gap-3 border-l-4 border-l-indigo-500">
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
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const colSpan =
                    1 + (typeId !== "all" ? typeFields.length : 0);
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
                {pagedDocs.map((doc: any) => {
                  const fv = (doc.field_values ?? {}) as Record<string, unknown>;
                  const fmt = (v: unknown) => {
                    if (v === null || v === undefined || v === "") return "—";
                    if (typeof v === "boolean") return v ? "Sim" : "Não";
                    return String(v);
                  };
                  const uploaderName =
                    uploaderMap[doc.uploaded_by] ?? "—";
                  return (
                    <TableRow
                      key={doc.id}
                      className="cursor-pointer transition-colors"
                      data-state={preview?.id === doc.id ? "selected" : undefined}
                      onClick={() => setPreview(doc)}
                    >
                      {typeId !== "all" &&
                        typeFields.map((f) => {
                          const raw = fv[f.field_key];
                          let cell: ReactNode = fmt(raw);
                          if (
                            f.field_type === "date" &&
                            typeof raw === "string" &&
                            /^\d{4}-\d{2}-\d{2}$/.test(raw)
                          ) {
                            const [y, m, d] = raw.split("-");
                            cell = `${d}/${m}/${y}`;
                          }
                          return (
                            <TableCell key={f.id} className="text-sm max-w-[200px] truncate">
                              {cell}
                            </TableCell>
                          );
                        })}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button size="sm" variant="ghost" title="Detalhes do arquivo">
                                <Info className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80 text-sm">
                              <div className="space-y-2.5">
                                <div className="font-semibold text-sm border-b border-border pb-2">
                                  Detalhes do arquivo
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <span className="text-muted-foreground text-xs">Nome</span>
                                  <span className="col-span-2 break-all text-xs">{doc.name}</span>

                                  <span className="text-muted-foreground text-xs">Tamanho</span>
                                  <span className="col-span-2 text-xs">
                                    {formatBytes(Number(doc.size_bytes))}
                                  </span>

                                  <span className="text-muted-foreground text-xs">Criado</span>
                                  <span className="col-span-2 text-xs">
                                    {format(new Date(doc.created_at), "dd/MM/yyyy HH:mm", {
                                      locale: ptBR,
                                    })}
                                  </span>

                                  <span className="text-muted-foreground text-xs">Editado em</span>
                                  <span className="col-span-2 text-xs">
                                    {doc.updated_at && doc.updated_at !== doc.created_at
                                      ? format(new Date(doc.updated_at), "dd/MM/yyyy HH:mm", {
                                          locale: ptBR,
                                        })
                                      : "—"}
                                  </span>

                                  <span className="text-muted-foreground text-xs">Operador</span>
                                  <span className="col-span-2 text-xs font-medium">
                                    {uploaderName}
                                  </span>

                                  <span className="text-muted-foreground text-xs">Último editor</span>
                                  <span className="col-span-2 text-xs font-medium">
                                    {editorMap[doc.last_edited_by] ?? "—"}
                                  </span>


                                  <span className="text-muted-foreground text-xs">Custo IA</span>
                                  <span className="col-span-2 text-xs">
                                    {usageMap[doc.id] != null
                                      ? `R$ ${usageMap[doc.id].toFixed(2).replace(".", ",")}`
                                      : "—"}
                                  </span>

                                  <span className="text-muted-foreground text-xs">Tempo IA</span>
                                  <span className="col-span-2 text-xs">
                                    {durationMap[doc.id] != null
                                      ? formatDuration(durationMap[doc.id]!)
                                      : "—"}
                                  </span>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              navigate({ to: "/documents/$id", params: { id: doc.id } });
                            }}
                            title="Editar indexação"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                setToDelete(doc);
                              }}
                              title="Excluir"
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


          {filtersSelected && filteredDocs.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <p className="text-muted-foreground">
                Mostrando {(page - 1) * PAGE_SIZE + 1}
                –{Math.min(page * PAGE_SIZE, filteredDocs.length)} de {filteredDocs.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Anterior
                </Button>
                <span className="text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>



      {preview && (
        <aside className="w-[480px] border-l border-border shrink-0 self-start sticky top-14 h-[calc(100vh-3.5rem)]">
          <div className="flex flex-col h-full bg-background">
            <div className="flex items-center justify-between p-3 border-b border-border bg-card shrink-0">
              <h2 className="font-medium text-sm">Pré-visualização</h2>
              <Button size="icon" variant="ghost" onClick={() => setPreview(null)} className="h-7 w-7">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <DocumentViewer doc={preview} />
            </div>
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
