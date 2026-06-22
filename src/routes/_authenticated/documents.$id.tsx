import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentViewer } from "@/components/document-viewer";
import { useDocument } from "@/hooks/use-documents";
import { useDocumentTypeFields } from "@/hooks/use-document-type-fields";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: doc, isLoading } = useDocument(id);
  const { data: fields = [] } = useDocumentTypeFields(doc?.document_type_id ?? null);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doc) setValues((doc.field_values ?? {}) as Record<string, unknown>);
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
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    const { error } = await supabase
      .from("documents")
      .update({
        field_values: values as never,
        last_edited_by: userId ?? doc!.uploaded_by,
      })
      .eq("id", doc!.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Indexação atualizada");
    queryClient.invalidateQueries({ queryKey: ["document", doc!.id] });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    navigate({ to: "/documents" });
  }

  const sanitize = (f: (typeof fields)[number], raw: string) => {
    const value = raw.trim();
    if (f.field_key.toLowerCase().includes("matricula")) {
      return value.replace(/\D/g, "");
    }
    if (f.field_type === "number" || f.field_type === "date") {
      return value;
    }
    return value.toUpperCase();
  };

  const set = (f: (typeof fields)[number], raw: string) =>
    setValues((prev) => ({ ...prev, [f.field_key]: sanitize(f, raw) }));

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-3xl space-y-6">
          <Button asChild variant="ghost" size="sm">
            <Link to="/documents">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
            </Link>
          </Button>

          <header>
            <h1 className="text-2xl font-display font-bold tracking-tight break-words">
              {doc.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Corrija os campos de indexação abaixo.
            </p>
          </header>

          <Card className="p-5 space-y-4">
            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Este documento não possui campos de indexação configurados.
              </p>
            )}
            {fields.map((f) => {
              const v = values[f.field_key];
              const strVal = v === null || v === undefined ? "" : String(v);
              const isMatricula = f.field_key.toLowerCase().includes("matricula");
              return (
                <div key={f.id} className="space-y-1.5">
                  <Label htmlFor={`f-${f.id}`}>
                    {f.label}
                    {f.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {f.field_type === "select" && Array.isArray(f.options) ? (
                    <Select
                      value={strVal || "none"}
                      onValueChange={(val) => set(f, val === "none" ? "" : val)}
                    >
                      <SelectTrigger id={`f-${f.id}`}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {(f.options as string[]).map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`f-${f.id}`}
                      value={strVal}
                      onChange={(e) => set(f, e.target.value)}
                      className={isMatricula ? undefined : f.field_type !== "number" && f.field_type !== "date" ? "uppercase" : undefined}
                      type={
                        f.field_type === "number"
                          ? "number"
                          : f.field_type === "date"
                          ? "date"
                          : "text"
                      }
                    />
                  )}
                </div>
              );
            })}
            {fields.length > 0 && (
              <Button onClick={save} disabled={saving}>
                <Save className="h-4 w-4 mr-1.5" /> Salvar alterações
              </Button>
            )}
          </Card>
        </div>
      </div>

      <aside className="w-[520px] border-l border-border hidden lg:flex flex-col">
        <DocumentViewer doc={doc} />
      </aside>
    </div>
  );
}
