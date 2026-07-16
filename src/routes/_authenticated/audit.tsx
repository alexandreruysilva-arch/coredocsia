import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  TrendingUp,
  FileText,
  Building2,
  AlertCircle,
  Download,
  Trash2,
  Timer,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useProfileBundle } from "@/hooks/use-profile";


export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

interface AiLogRow {
  id: string;
  created_at: string;
  company_name: string | null;
  document_type_name: string | null;
  file_name: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_brl: number | null;
  duration_ms: number | null;
  corrected_chars: number | null;
  extracted_chars: number | null;
  success: boolean;
  error_message: string | null;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}

function exportLogsXlsx(rows: AiLogRow[]) {
  const headers = [
    "Data",
    "Empresa",
    "Tipo",
    "Arquivo",
    "Modelo",
    "Prompt tokens",
    "Completion tokens",
    "Total tokens",
    "Custo (R$)",
    "Tempo IA",
    "Caracteres extraídos",
    "% Acerto",
    "Status",
    "Erro",
  ];
  const data = rows.map((l) => [
    formatDateTime(l.created_at),
    l.company_name ?? "",
    l.document_type_name ?? "",
    l.file_name,
    l.model === "gemini-2.5-flash-lite"
      ? "2.5 Flash Lite"
      : l.model === "claude-haiku-4-5-20251001"
        ? "Haiku 4.5"
        : l.model,
    l.prompt_tokens,
    l.completion_tokens,
    l.total_tokens,
    l.cost_brl != null ? Number(l.cost_brl.toFixed(4)) : "",
    l.duration_ms != null ? formatDuration(l.duration_ms) : "",
    l.extracted_chars ?? 0,
    l.extracted_chars && l.extracted_chars > 0
      ? Number(((Math.max(0, l.extracted_chars - (l.corrected_chars ?? 0)) / l.extracted_chars) * 100).toFixed(2)) / 100
      : "",
    l.success ? "OK" : "Falha",
    l.error_message ?? "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  // Format % Acerto column (index 11, letter L) as percentage
  for (let i = 0; i < data.length; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 11 })];
    if (cell && typeof cell.v === "number") cell.z = "0%";
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Auditoria IA");
  XLSX.writeFile(wb, `auditoria-ia-${new Date().toISOString().slice(0, 10)}.xlsx`);
}



function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function AuditPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("__all__");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("__all__");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounced(search, 300);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, companyFilter, docTypeFilter]);

  const filterKey = { debouncedSearch, companyFilter, docTypeFilter };

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["ai-audit-summary", orgId, filterKey],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ai_audit_summary", {
        _org_id: orgId!,
        _company: companyFilter,
        _doc_type: docTypeFilter,
        _search: debouncedSearch,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const { data: pageData, isLoading: pageLoading } = useQuery({
    queryKey: ["ai-audit-logs", orgId, filterKey, page],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ai_audit_logs", {
        _org_id: orgId!,
        _company: companyFilter,
        _doc_type: docTypeFilter,
        _search: debouncedSearch,
        _limit: PAGE_SIZE,
        _offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      return data as unknown as { rows: AiLogRow[]; count: number };
    },
  });

  const { data: orgPrice } = useQuery({
    queryKey: ["org-ai-price", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("ai_cost_per_file")
        .eq("id", orgId!)
        .maybeSingle();
      return Number(data?.ai_cost_per_file ?? 0.15);
    },
  });

  const isLoading = summaryLoading || pageLoading;
  const paged: AiLogRow[] = pageData?.rows ?? [];
  const filteredCount = pageData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const companyOptions: string[] = summary?.company_options ?? [];
  const docTypeOptions: string[] = summary?.doc_type_options ?? [];

  useEffect(() => {
    if (docTypeFilter !== "__all__" && docTypeOptions.length > 0 && !docTypeOptions.includes(docTypeFilter)) {
      setDocTypeFilter("__all__");
    }
  }, [docTypeOptions, docTypeFilter]);

  const t = summary?.totals ?? {};
  const totals = {
    files: Number(t.files ?? 0),
    success: Number(t.success ?? 0),
    failed: Number(t.failed ?? 0),
    prompt: Number(t.prompt ?? 0),
    completion: Number(t.completion ?? 0),
    total: Number(t.total ?? 0),
    cost: Number(t.cost ?? 0),
    durationCount: Number(t.duration_count ?? 0),
    durationTotal: Number(t.duration_total ?? 0),
    extracted: Number(t.extracted ?? 0),
    corrected: Number(t.corrected ?? 0),
    accuracySum: Number(t.accuracy_sum ?? 0),
    accuracyCount: Number(t.accuracy_count ?? 0),
  };

  const byCompany: [string, { files: number; tokens: number; cost: number }][] =
    (summary?.by_company ?? []).map((r: any) => [
      r.name,
      { files: Number(r.files), tokens: Number(r.tokens), cost: Number(r.cost) },
    ]);

  // Export baixa todas as linhas filtradas (limite server-side de 5000).
  async function handleExport() {
    if (!orgId) return;
    const { data, error } = await supabase.rpc("get_ai_audit_logs", {
      _org_id: orgId,
      _company: companyFilter,
      _doc_type: docTypeFilter,
      _search: debouncedSearch,
      _limit: 5000,
      _offset: 0,
    });
    if (error) {
      toast.error("Falha ao exportar", { description: error.message });
      return;
    }
    exportLogsXlsx(((data as any)?.rows ?? []) as AiLogRow[]);
  }

  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_usage_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-audit-summary", orgId] });
      queryClient.invalidateQueries({ queryKey: ["ai-audit-logs", orgId] });
      toast.success("Registro excluído", {
        description: "O registro de auditoria foi removido permanentemente.",
      });
    },
    onError: (error) => {
      toast.error("Erro ao excluir", {
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
      });
    },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-4 md:p-5">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-muted-foreground mb-2">
            <Sparkles className="h-3.5 w-3.5 text-blue-800" />
            Painel de uso de IA
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
            Auditoria de IA
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Log de uso da indexação por IA: empresa, tipo de documento, arquivo e tokens consumidos
            em cada processamento. Use o somatório para cobrança futura.
          </p>
        </div>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-2.5 border-0 bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <FileText className="absolute right-0 h-3.5 w-3.5" />
            <span>Arquivos processados</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">{totals.files.toLocaleString("pt-BR")}</div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            {totals.success} sucesso · {totals.failed} falha
          </div>
        </Card>
        <Card className="p-2.5 border-0 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <Sparkles className="absolute right-0 h-3.5 w-3.5" />
            <span>Custo total</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">
            R$ {totals.cost.toFixed(2).replace(".", ",")}
          </div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            Média R$ {(totals.files > 0 ? totals.cost / totals.files : 0).toFixed(2).replace(".", ",")} por arquivo
          </div>
        </Card>
        <Card className="p-2.5 border-0 bg-gradient-to-br from-slate-700 to-blue-900 text-white shadow-lg shadow-slate-700/20 hover:shadow-slate-700/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <TrendingUp className="absolute right-0 h-3.5 w-3.5" />
            <span>Tokens totais</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">{totals.total.toLocaleString("pt-BR")}</div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            {totals.prompt.toLocaleString("pt-BR")} prompt · {totals.completion.toLocaleString("pt-BR")} compl.
          </div>
        </Card>
        <Card className="p-2.5 border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <Timer className="absolute right-0 h-3.5 w-3.5" />
            <span>Tempo médio IA</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">
            {totals.durationCount > 0
              ? formatDuration(Math.round(totals.durationTotal / totals.durationCount))
              : "—"}
          </div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            {totals.durationCount} medições
          </div>
        </Card>
        <Card className="p-2.5 border-0 bg-gradient-to-br from-cyan-700 to-sky-800 text-white shadow-lg shadow-cyan-700/20 hover:shadow-cyan-700/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <Sparkles className="absolute right-0 h-3.5 w-3.5" />
            <span>% Acerto médio</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">
            {totals.accuracyCount > 0
              ? `${Math.trunc(totals.accuracySum / totals.accuracyCount)}%`
              : "—"}
          </div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            Média de {totals.accuracyCount} arquivo{totals.accuracyCount === 1 ? "" : "s"}
          </div>
        </Card>
      </div>

      {byCompany.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Somatório por empresa</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Arquivos</TableHead>
                  <TableHead className="text-right">Custo (R$)</TableHead>
                  <TableHead className="text-right">Tokens totais</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCompany.map(([name, v]) => (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-right">{v.files}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      R$ {v.cost.toFixed(2).replace(".", ",")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.tokens.toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Card className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold text-sm">Detalhes por arquivo</h3>
          <div className="flex items-center gap-2 flex-nowrap">
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="h-8 w-[170px] text-xs">

                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as empresas</SelectItem>
                {companyOptions.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue placeholder="Tipo de documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                {docTypeOptions.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar por arquivo, empresa ou tipo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 max-w-[220px] text-xs"
            />
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 h-8"
              disabled={companyFilter === "__all__" && docTypeFilter === "__all__" && search === ""}
              onClick={() => {
                setCompanyFilter("__all__");
                setDocTypeFilter("__all__");
                setSearch("");
              }}
            >
              <X className="h-4 w-4" /> Limpar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={filteredCount === 0}
              onClick={handleExport}
            >
              <Download className="h-4 w-4" /> Exportar XLSX
            </Button>
          </div>
        </div>


        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma indexação por IA registrada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-3 px-3">
            <Table className="text-xs [&_th]:h-9 [&_th]:px-2 [&_th]:text-[11px] [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-center [&_td]:px-2 [&_td]:py-2 [&_td]:align-middle [&_td]:text-center">
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="!px-1">Tokens</TableHead>
                  <TableHead className="!px-1">Custo</TableHead>
                  <TableHead className="!px-1">Tempo</TableHead>
                  <TableHead className="!px-1">Caract. Extr.</TableHead>
                  <TableHead className="!px-1">% Acerto</TableHead>
                  <TableHead className="!px-1">Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(l.created_at)}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate" title={l.company_name ?? ""}>
                      {l.company_name ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate" title={l.document_type_name ?? ""}>
                      {l.document_type_name ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate !text-left" title={l.file_name}>
                      {l.file_name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {l.model === "gemini-2.5-flash-lite"
                        ? "2.5 Flash Lite"
                        : l.model === "claude-haiku-4-5-20251001"
                          ? "Haiku 4.5"
                          : l.model}
                    </TableCell>
                    <TableCell className="!px-1 text-right tabular-nums font-medium whitespace-nowrap">
                      {l.total_tokens.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="!px-1 text-right tabular-nums whitespace-nowrap">
                      {l.cost_brl != null
                        ? `R$ ${l.cost_brl.toFixed(2).replace(".", ",")}`
                        : "—"}
                    </TableCell>
                    <TableCell className="!px-1 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {l.duration_ms != null ? formatDuration(l.duration_ms) : "—"}
                    </TableCell>
                    <TableCell className="!px-1 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {(l.extracted_chars ?? 0).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="!px-1 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {l.extracted_chars && l.extracted_chars > 0
                        ? `${Math.trunc((Math.max(0, l.extracted_chars - (l.corrected_chars ?? 0)) / l.extracted_chars) * 100)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="!px-1">
                      {l.success ? (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">OK</Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                          <AlertCircle className="h-3 w-3" />
                          Falha
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label="Excluir registro"
                        disabled={deleteLog.isPending && deleteLog.variables === l.id}
                        onClick={() => {
                          const company = l.company_name ?? "Empresa não informada";
                          const docType = l.document_type_name ?? "Tipo não informado";
                          const date = formatDateTime(l.created_at);
                          const cost =
                            l.cost_brl != null
                              ? `R$ ${l.cost_brl.toFixed(2).replace(".", ",")}`
                              : "custo não calculado";

                          if (
                            window.confirm(
                              `Excluir permanentemente este registro de auditoria?\n\n` +
                                `Arquivo: ${l.file_name}\n` +
                                `Empresa: ${company}\n` +
                                `Tipo: ${docType}\n` +
                                `Data: ${date}\n` +
                                `Tokens: ${l.total_tokens.toLocaleString("pt-BR")} (${cost})\n\n` +
                                `Esta ação não pode ser desfeita.`,
                            )
                          ) {
                            deleteLog.mutate(l.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredCount > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredCount)} de {filteredCount}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Próximo <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
