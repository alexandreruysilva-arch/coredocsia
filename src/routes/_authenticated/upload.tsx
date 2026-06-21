import { useMemo, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { createFileRoute } from "@tanstack/react-router";
import { Upload, X, FileText, Image as ImageIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { useProfileBundle } from "@/hooks/use-profile";
import { useDocumentTypes } from "@/hooks/use-document-types";
import { useCompanies } from "@/hooks/use-companies";
import { useDocumentTypeFields } from "@/hooks/use-document-type-fields";
import { useAllowedDocumentTypeIds } from "@/hooks/use-allowed-document-types";
import {
  ALLOWED_MIME,
  MAX_FILES_PER_BATCH,
  formatBytes,
  uploadDocument,
  validateFile,
} from "@/lib/documents";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
});

interface QueueItem {
  id: string;
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

function UploadPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const userId = profile?.profile.id ?? null;
  const { data: companies = [] } = useCompanies(orgId);
  const { data: allTypes = [] } = useDocumentTypes(orgId);
  const { data: allowedTypeIds = null } = useAllowedDocumentTypeIds();
  const queryClient = useQueryClient();

  const [items, setItems] = useState<QueueItem[]>([]);
  const [companyId, setCompanyId] = useState<string>("none");
  const [docTypeId, setDocTypeId] = useState<string>("none");
  const [tagsInput, setTagsInput] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);

  // Restrict types by company + allowed types (for non-admins).
  const types = useMemo(() => {
    let list = allTypes;
    if (companyId !== "none") list = list.filter((t: any) => t.company_id === companyId);
    if (allowedTypeIds) list = list.filter((t) => allowedTypeIds.includes(t.id));
    return list;
  }, [allTypes, companyId, allowedTypeIds]);

  const { data: fields = [] } = useDocumentTypeFields(
    docTypeId !== "none" ? docTypeId : null,
  );

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    rejected.forEach((r) => {
      toast.error(`${r.file.name}: ${r.errors[0]?.message ?? "rejeitado"}`);
    });
    setItems((prev) => {
      const room = MAX_FILES_PER_BATCH - prev.length;
      if (room <= 0) {
        toast.error(`Máximo de ${MAX_FILES_PER_BATCH} arquivos por lote`);
        return prev;
      }
      const toAdd = accepted.slice(0, room).map<QueueItem>((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "queued",
        progress: 0,
      }));
      return [...prev, ...toAdd];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_MIME.reduce<Record<string, string[]>>((acc, m) => {
      acc[m] = [];
      return acc;
    }, {}),
    maxSize: 25 * 1024 * 1024,
    multiple: true,
    disabled: isUploading,
  });

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function setFieldValue(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleUploadAll() {
    if (!orgId || !userId) {
      toast.error("Organização não definida");
      return;
    }
    if (companyId === "none") {
      toast.error("Selecione a empresa");
      return;
    }
    if (docTypeId === "none") {
      toast.error("Selecione o tipo de documento");
      return;
    }
    // Validate required fields
    for (const f of fields) {
      if (f.required && !String(fieldValues[f.field_key] ?? "").trim()) {
        toast.error(`Campo obrigatório: ${f.label}`);
        return;
      }
    }
    const queued = items.filter((i) => i.status === "queued");
    if (queued.length === 0) return;

    setIsUploading(true);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    for (const item of queued) {
      const err = validateFile(item.file);
      if (err) {
        setItems((p) => p.map((i) => (i.id === item.id ? { ...i, status: "error", error: err } : i)));
        continue;
      }
      setItems((p) => p.map((i) => (i.id === item.id ? { ...i, status: "uploading", progress: 0 } : i)));
      try {
        await uploadDocument({
          file: item.file,
          orgId,
          userId,
          name: item.file.name,
          documentTypeId: docTypeId,
          companyId,
          fieldValues,
          tags,
          onProgress: (pct) => {
            setItems((p) => p.map((i) => (i.id === item.id ? { ...i, progress: pct } : i)));
          },
        });
        setItems((p) => p.map((i) => (i.id === item.id ? { ...i, status: "done", progress: 100 } : i)));
      } catch (e: any) {
        setItems((p) =>
          p.map((i) => (i.id === item.id ? { ...i, status: "error", error: e.message ?? "Erro" } : i)),
        );
      }
    }

    setIsUploading(false);
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    toast.success("Upload finalizado");
  }

  function clearDone() {
    setItems((p) => p.filter((i) => i.status !== "done"));
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-display font-bold tracking-tight">Upload de documentos</h1>
        <p className="text-muted-foreground mt-1">
          Selecione a empresa, o tipo de documento e preencha os campos antes de enviar. Até {MAX_FILES_PER_BATCH} arquivos por lote. PDF, JPG, PNG, TIFF, WEBP — até 25 MB cada.
        </p>
      </header>

      <Card className="p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Empresa *</Label>
            <Select
              value={companyId}
              onValueChange={(v) => {
                setCompanyId(v);
                setDocTypeId("none");
                setFieldValues({});
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Selecione...</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo do documento *</Label>
            <Select
              value={docTypeId}
              onValueChange={(v) => {
                setDocTypeId(v);
                setFieldValues({});
              }}
              disabled={companyId === "none"}
            >
              <SelectTrigger>
                <SelectValue placeholder={companyId === "none" ? "Selecione a empresa primeiro" : "Selecionar"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Selecione...</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {fields.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">Campos do documento</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {fields.map((f) => {
                const val = fieldValues[f.field_key] ?? "";
                const common = {
                  id: f.id,
                  value: val,
                  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setFieldValue(f.field_key, e.target.value),
                };
                return (
                  <div key={f.id} className="space-y-2">
                    <Label htmlFor={f.id}>
                      {f.label} {f.required && <span className="text-destructive">*</span>}
                    </Label>
                    {f.field_type === "textarea" ? (
                      <Textarea {...common} rows={3} />
                    ) : f.field_type === "select" && Array.isArray(f.options) ? (
                      <Select value={val} onValueChange={(v) => setFieldValue(f.field_key, v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {(f.options as string[]).map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        {...common}
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
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Tags (separadas por vírgula)</Label>
          <Input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="ex: jan/2026, cliente-x"
          />
        </div>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          } ${isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input {...getInputProps()} />
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">
            {isDragActive ? "Solte os arquivos aqui" : "Arraste arquivos ou clique para selecionar"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">PDF, JPG, PNG, TIFF, WEBP • máx 25 MB</p>
        </div>

        {items.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">{items.length} arquivo(s) na fila</h3>
              <div className="flex gap-2">
                {items.some((i) => i.status === "done") && (
                  <Button size="sm" variant="ghost" onClick={clearDone}>
                    Limpar finalizados
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleUploadAll}
                  disabled={isUploading || !items.some((i) => i.status === "queued")}
                >
                  Enviar {items.filter((i) => i.status === "queued").length} arquivo(s)
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-border rounded-md border border-border">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 p-3">
                  {item.file.type.startsWith("image/") ? (
                    <ImageIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{item.file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatBytes(item.file.size)}
                      </span>
                    </div>
                    {item.status === "uploading" && (
                      <Progress value={item.progress} className="h-1 mt-1.5" />
                    )}
                    {item.status === "error" && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {item.error}
                      </p>
                    )}
                  </div>
                  {item.status === "done" && (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  )}
                  {(item.status === "queued" || item.status === "error") && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeItem(item.id)}
                      disabled={isUploading}
                      className="h-7 w-7"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
