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
} from "lucide-react";
import { toast } from "sonner";
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

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportLogsCsv(rows: AiLogRow[]) {
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
    "Status",
    "Erro",
  ];
  const lines = [headers.join(";")];
  for (const l of rows) {
    lines.push(
      [
        formatDateTime(l.created_at),
        l.company_name ?? "",
        l.document_type_name ?? "",
        l.file_name,
        l.model,
        l.prompt_tokens,
        l.completion_tokens,
        l.total_tokens,
        l.cost_brl != null ? l.cost_brl.toFixed(4).replace(".", ",") : "",
        l.duration_ms != null ? formatDuration(l.duration_ms) : "",
        l.success ? "OK" : "Falha",
        l.error_message ?? "",
      ]
        .map(csvEscape)
        .join(";"),
    );
  }
  const csv = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `auditoria-ia-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


function AuditPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["ai-usage-logs", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<AiLogRow[]> => {
      const { data, error } = await supabase
        .from("ai_usage_logs")
        .select(
          "id, created_at, company_name, document_type_name, file_name, model, prompt_tokens, completion_tokens, total_tokens, cost_brl, duration_ms, success, error_message",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AiLogRow[];
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


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.file_name.toLowerCase().includes(q) ||
        (l.company_name ?? "").toLowerCase().includes(q) ||
        (l.document_type_name ?? "").toLowerCase().includes(q),
    );
  }, [logs, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const totals = useMemo(() => {
    const t = {
      files: filtered.length,
      success: 0,
      failed: 0,
      prompt: 0,
      completion: 0,
      total: 0,
      cost: 0,
      durationCount: 0,
      durationTotal: 0,
    };
    for (const l of filtered) {
      if (l.success) t.success++;
      else t.failed++;
      t.prompt += l.prompt_tokens;
      t.completion += l.completion_tokens;
      t.total += l.total_tokens;
      t.cost += l.cost_brl ?? 0;
      if (l.duration_ms != null) {
        t.durationCount++;
        t.durationTotal += l.duration_ms;
      }
    }
    return t;
  }, [filtered]);

  const byCompany = useMemo(() => {
    const map = new Map<string, { files: number; tokens: number; cost: number }>();
    for (const l of filtered) {
      const k = l.company_name ?? "—";
      const cur = map.get(k) ?? { files: 0, tokens: 0, cost: 0 };
      cur.files += 1;
      cur.tokens += l.total_tokens;
      cur.cost += l.cost_brl ?? 0;
      map.set(k, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].cost - a[1].cost);
  }, [filtered]);

  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_usage_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["ai-usage-logs", orgId] });
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
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-6">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-3 py-1 text-xs font-medium text-muted-foreground mb-3">
            <Sparkles className="h-3.5 w-3.5 text-blue-800" />
            Painel de uso de IA
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
            Auditoria de IA
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">
            Log de uso da indexação por IA: empresa, tipo de documento, arquivo e tokens consumidos
            em cada processamento. Use o somatório para cobrança futura.
          </p>
        </div>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-0 bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-white/85 text-xs font-medium">
            <FileText className="h-4 w-4" /> Arquivos processados
          </div>
          <div className="text-3xl font-bold mt-1 tabular-nums">{totals.files.toLocaleString("pt-BR")}</div>
          <div className="text-xs text-white/85 mt-1">
            {totals.success} sucesso · {totals.failed} falha
          </div>
        </Card>
        <Card className="p-4 border-0 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-white/85 text-xs font-medium">
            <Sparkles className="h-4 w-4" /> Custo total
          </div>
          <div className="text-3xl font-bold mt-1 tabular-nums">
            R$ {totals.cost.toFixed(2).replace(".", ",")}
          </div>
          <div className="text-xs text-white/85 mt-1">
            Base R$ {(orgPrice ?? 0.15).toFixed(2).replace(".", ",")} até 1.100 tokens · +R$ 0,01/500
          </div>
        </Card>
        <Card className="p-4 border-0 bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white shadow-lg shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40 hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-white/85 text-xs font-medium">
            <TrendingUp className="h-4 w-4" /> Tokens totais
          </div>
          <div className="text-3xl font-bold mt-1 tabular-nums">{totals.total.toLocaleString("pt-BR")}</div>
          <div className="text-xs text-white/85 mt-1">
            {totals.prompt.toLocaleString("pt-BR")} prompt · {totals.completion.toLocaleString("pt-BR")} compl.
          </div>
        </Card>
        <Card className="p-4 border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-white/85 text-xs font-medium">
            <Timer className="h-4 w-4" /> Tempo médio IA
          </div>
          <div className="text-3xl font-bold mt-1 tabular-nums">
            {totals.durationCount > 0
              ? formatDuration(Math.round(totals.durationTotal / totals.durationCount))
              : "—"}
          </div>
          <div className="text-xs text-white/85 mt-1">
            {totals.durationCount} medições
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

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="font-semibold">Detalhes por arquivo</h3>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por arquivo, empresa ou tipo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={filtered.length === 0}
              onClick={() => exportLogsCsv(filtered)}
            >
              <Download className="h-4 w-4" /> Exportar CSV
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Total Token</TableHead>
                  <TableHead className="text-right">Custo (R$)</TableHead>
                  <TableHead className="text-right">Tempo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDateTime(l.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">{l.company_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{l.document_type_name ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-[240px] truncate" title={l.file_name}>
                      {l.file_name}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.model}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {l.total_tokens.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.cost_brl != null
                        ? `R$ ${l.cost_brl.toFixed(2).replace(".", ",")}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {l.duration_ms != null ? formatDuration(l.duration_ms) : "—"}
                    </TableCell>
                    <TableCell>
                      {l.success ? (
                        <Badge variant="secondary">OK</Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
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
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
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
