import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Sparkles, TrendingUp, FileText, Building2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

function AuditPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["ai-usage-logs", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<AiLogRow[]> => {
      const { data, error } = await supabase
        .from("ai_usage_logs")
        .select(
          "id, created_at, company_name, document_type_name, file_name, model, prompt_tokens, completion_tokens, total_tokens, cost_brl, success, error_message",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AiLogRow[];
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

  const totals = useMemo(() => {
    const t = {
      files: filtered.length,
      success: 0,
      failed: 0,
      prompt: 0,
      completion: 0,
      total: 0,
    };
    for (const l of filtered) {
      if (l.success) t.success++;
      else t.failed++;
      t.prompt += l.prompt_tokens;
      t.completion += l.completion_tokens;
      t.total += l.total_tokens;
    }
    return t;
  }, [filtered]);

  const byCompany = useMemo(() => {
    const map = new Map<string, { files: number; tokens: number }>();
    for (const l of filtered) {
      const k = l.company_name ?? "—";
      const cur = map.get(k) ?? { files: 0, tokens: 0 };
      cur.files += 1;
      cur.tokens += l.total_tokens;
      map.set(k, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].tokens - a[1].tokens);
  }, [filtered]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-display font-bold tracking-tight">Auditoria de IA</h1>
        <p className="text-muted-foreground mt-1">
          Log de uso da indexação por IA: empresa, tipo de documento, arquivo e tokens consumidos
          em cada processamento. Use o somatório para cobrança futura.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <FileText className="h-4 w-4" /> Arquivos processados
          </div>
          <div className="text-2xl font-bold mt-1">{totals.files.toLocaleString("pt-BR")}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {totals.success} sucesso · {totals.failed} falha
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Sparkles className="h-4 w-4" /> Tokens totais
          </div>
          <div className="text-2xl font-bold mt-1">{totals.total.toLocaleString("pt-BR")}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <TrendingUp className="h-4 w-4" /> Tokens prompt
          </div>
          <div className="text-2xl font-bold mt-1">{totals.prompt.toLocaleString("pt-BR")}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <TrendingUp className="h-4 w-4" /> Tokens resposta
          </div>
          <div className="text-2xl font-bold mt-1">{totals.completion.toLocaleString("pt-BR")}</div>
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
                  <TableHead className="text-right">Tokens totais</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCompany.map(([name, v]) => (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-right">{v.files}</TableCell>
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
          <Input
            placeholder="Buscar por arquivo, empresa ou tipo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
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
                  <TableHead className="text-right">Prompt</TableHead>
                  <TableHead className="text-right">Resposta</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
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
                    <TableCell className="text-right tabular-nums">
                      {l.prompt_tokens.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.completion_tokens.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {l.total_tokens.toLocaleString("pt-BR")}
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
