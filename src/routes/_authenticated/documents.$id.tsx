import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { DocumentViewer } from "@/components/document-viewer";
import { useDocument } from "@/hooks/use-documents";
import { useDocumentTypes } from "@/hooks/use-document-types";
import { useProfileBundle } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { formatBytes } from "@/lib/documents";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const isAdmin = profile?.roles.includes("org_admin") || profile?.isPlatformAdmin;
  const { data: doc, isLoading } = useDocument(id);
  const { data: types = [] } = useDocumentTypes(orgId);

  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState<string>("none");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doc) {
      setName(doc.name);
      setTypeId(doc.document_type_id ?? "none");
      setTags(doc.tags);
    }
  }, [doc]);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Carregando...</div>;
  }
  if (!doc) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-muted-foreground">Documento não encontrado.</p>
        <Button asChild variant="outline">
          <Link to="/documents">Voltar</Link>
        </Button>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("documents")
      .update({
        name: name.trim() || doc!.name,
        document_type_id: typeId === "none" ? null : typeId,
        tags,
      })
      .eq("id", doc!.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Documento atualizado");
      queryClient.invalidateQueries({ queryKey: ["document", doc!.id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
  }

  async function softDelete() {
    if (!confirm("Excluir este documento?")) return;
    const { error } = await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", doc!.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Documento removido");
      navigate({ to: "/documents" });
    }
  }

  function addTag(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const v = tagInput.trim().replace(/,$/, "");
      if (v && !tags.includes(v)) setTags([...tags, v]);
      setTagInput("");
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-3xl space-y-6">
          <div className="flex items-center justify-between">
            <Button asChild variant="ghost" size="sm">
              <Link to="/documents">
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
              </Link>
            </Button>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={softDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-1.5" /> Excluir
              </Button>
            )}
          </div>

          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-display font-bold tracking-tight break-words">
                {doc.name}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{doc.original_filename}</p>
            </div>
            <StatusBadge status={doc.status} />
          </header>

          <Card className="p-5 space-y-4">
            <h2 className="font-medium">Metadados</h2>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem classificação</SelectItem>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="font-normal">
                    {t}
                    <button
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={addTag}
                placeholder="Digite e pressione Enter"
              />
            </div>
            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4 mr-1.5" /> Salvar alterações
            </Button>
          </Card>

          <Card className="p-5 space-y-2 text-sm">
            <h2 className="font-medium mb-2">Informações</h2>
            <Row label="Tamanho" value={formatBytes(Number(doc.size_bytes))} />
            <Row label="Tipo MIME" value={doc.mime_type} />
            <Row
              label="Criado em"
              value={format(new Date(doc.created_at), "dd 'de' MMM yyyy 'às' HH:mm", { locale: ptBR })}
            />
            <Row
              label="Atualizado em"
              value={format(new Date(doc.updated_at), "dd 'de' MMM yyyy 'às' HH:mm", { locale: ptBR })}
            />
            {doc.page_count != null && <Row label="Páginas" value={String(doc.page_count)} />}
          </Card>
        </div>
      </div>

      <aside className="w-[520px] border-l border-border hidden lg:flex flex-col">
        <DocumentViewer doc={doc} />
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
