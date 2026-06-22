import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, ChevronLeft, ChevronRight, ListChecks, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { useProfileBundle } from "@/hooks/use-profile";
import { formatBytes, type DocStatus, type DocumentRow } from "@/lib/documents";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/queue")({
  component: QueuePage,
});

type QueueDoc = DocumentRow & {
  ai_usage_logs?: { id: string; duration_ms: number | null }[];
};
type QueueStatus = DocStatus | "processed_ai" | "processed_manual" | "all";

function QueuePage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const isAdmin = profile?.roles.includes("org_admin") || profile?.isPlatformAdmin;
  const [status, setStatus] = useState<QueueStatus>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const queryClient = useQueryClient();

  const {
    data: docs = [],
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["queue-documents", orgId, status],
    enabled: !!orgId,
    queryFn: async (): Promise<QueueDoc[]> => {
      let q = supabase
        .from("documents")
        .select("*, ai_usage_logs(id, duration_ms)")
        .eq("org_id", orgId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);

      if (status === "pending") q = q.eq("status", "pending");
      else if (status === "processing") q = q.eq("status", "processing");
      else if (status === "failed") q = q.eq("status", "failed");
      else if (
        status === "processed" ||
        status === "processed_ai" ||
        status === "processed_manual"
      ) {
        q = q.eq("status", "processed");
      }

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as QueueDoc[];
      if (status === "processed_ai") {
        return rows.filter((d) => (d.ai_usage_logs?.length ?? 0) > 0);
      }
      if (status === "processed_manual") {
        return rows.filter((d) => (d.ai_usage_logs?.length ?? 0) === 0);
      }
      return rows;
    },
  });

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`queue-documents:${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents", filter: `org_id=eq.${orgId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["queue-documents"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const totalPages = Math.max(1, Math.ceil(docs.length / pageSize));
  const paginatedDocs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return docs.slice(start, start + pageSize);
  }, [docs, page]);

  const counts = useMemo(() => {
    const c = {
      pending: 0,
      processing: 0,
      processed: 0,
      processed_ai: 0,
      processed_manual: 0,
      failed: 0,
    };
    docs.forEach((d) => {
      if (d.status === "processed") {
        const hasAi = (d.ai_usage_logs?.length ?? 0) > 0;
        if (hasAi) c.processed_ai++;
        else c.processed_manual++;
      } else {
        c[d.status]++;
      }
    });
    return c;
  }, [docs]);

  async function reprocess(id: string) {
    const { error } = await supabase
      .from("documents")
      .update({ status: "pending", error_message: null })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Reprocessamento agendado");
    queryClient.invalidateQueries({ queryKey: ["queue-documents"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir este documento?")) return;
    const { error } = await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Documento removido");
    queryClient.invalidateQueries({ queryKey: ["queue-documents"] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight flex items-center gap-2">
            <ListChecks className="h-7 w-7 text-primary" /> Fila de processamento
          </h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe o status dos documentos em tempo real.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="p-4">
          <StatusBadge status="pending" />
          <p className="text-3xl font-display font-semibold mt-2">{counts.pending}</p>
        </Card>
        <Card className="p-4">
          <StatusBadge status="processing" />
          <p className="text-3xl font-display font-semibold mt-2">{counts.processing}</p>
        </Card>
        <Card className="p-4">
          <Badge
            variant="outline"
            className="gap-1.5 font-normal bg-primary/10 text-primary border-primary/20"
          >
            <Sparkles className="h-3 w-3" /> Processado IA
          </Badge>
          <p className="text-3xl font-display font-semibold mt-2">{counts.processed_ai}</p>
        </Card>
        <Card className="p-4">
          <Badge
            variant="outline"
            className="gap-1.5 font-normal bg-success/10 text-success border-success/20"
          >
            <CheckCircle2 className="h-3 w-3" /> Indexação Manual
          </Badge>
          <p className="text-3xl font-display font-semibold mt-2">{counts.processed_manual}</p>
        </Card>
        <Card className="p-4">
          <StatusBadge status="failed" />
          <p className="text-3xl font-display font-semibold mt-2">{counts.failed}</p>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Select value={status} onValueChange={(v) => setStatus(v as QueueStatus)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="processing">Processando</SelectItem>
              <SelectItem value="processed_ai">Processado IA</SelectItem>
              <SelectItem value="processed_manual">Indexação Manual</SelectItem>
              <SelectItem value="processed">Processado (todos)</SelectItem>
              <SelectItem value="failed">Falhou</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tempo IA</TableHead>
              <TableHead>Enviado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && docs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum documento na fila.
                </TableCell>
              </TableRow>
            )}
            {paginatedDocs.map((doc) => {
              const durationMs = doc.ai_usage_logs?.[0]?.duration_ms ?? null;
              return (
              <TableRow key={doc.id}>
                <TableCell className="font-medium max-w-[300px] truncate">
                  {doc.name}
                  {doc.error_message && (
                    <p className="text-xs text-destructive font-normal mt-0.5">
                      {doc.error_message}
                    </p>
                  )}
                </TableCell>
                <TableCell>{formatBytes(Number(doc.size_bytes))}</TableCell>
                <TableCell>
                  <StatusBadge status={doc.status} />
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {durationMs != null ? formatDuration(durationMs) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(doc.created_at), "dd/MM/yyyy HH:mm", {
                    locale: ptBR,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  {doc.status === "failed" && (
                    <Button size="sm" variant="ghost" onClick={() => reprocess(doc.id)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reprocessar
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(doc.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );})}
          </TableBody>
        </Table>
        {docs.length > pageSize && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages} · {docs.length} registros
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
      </Card>
    </div>
  );
}
