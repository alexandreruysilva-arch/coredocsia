import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ListChecks, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { useDocumentsList } from "@/hooks/use-documents";
import { formatBytes, type DocStatus } from "@/lib/documents";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/queue")({
  component: QueuePage,
});

function QueuePage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const isAdmin = profile?.roles.includes("org_admin") || profile?.isPlatformAdmin;
  const [status, setStatus] = useState<DocStatus | "all">("all");
  const { data: docs = [], isLoading, refetch, isFetching } = useDocumentsList({ orgId, status });
  const queryClient = useQueryClient();

  const counts = useMemo(() => {
    const c = { pending: 0, processing: 0, processed: 0, failed: 0 };
    docs.forEach((d) => {
      c[d.status]++;
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
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir este documento?")) return;
    const { error } = await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Documento removido");
    queryClient.invalidateQueries({ queryKey: ["documents"] });
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["pending", "processing", "processed", "failed"] as DocStatus[]).map((s) => (
          <Card key={s} className="p-4">
            <StatusBadge status={s} />
            <p className="text-3xl font-display font-semibold mt-2">{counts[s]}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="processing">Processando</SelectItem>
              <SelectItem value="processed">Processado</SelectItem>
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
              <TableHead>Enviado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && docs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum documento na fila.
                </TableCell>
              </TableRow>
            )}
            {docs.map((doc) => (
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
                <TableCell className="text-muted-foreground text-sm">
                  {formatDistanceToNow(new Date(doc.created_at), {
                    addSuffix: true,
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
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
