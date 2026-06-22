import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import { PdfPreview } from "@/components/pdf-preview";
import { useDropzone } from "react-dropzone";
import { createFileRoute } from "@tanstack/react-router";
import {
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { extractFieldsWithGemini } from "@/lib/gemini.functions";
import { cn } from "@/lib/utils";
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
import { useDocumentTypeFields, type DocTypeField } from "@/hooks/use-document-type-fields";
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
  previewUrl: string;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  fieldValues: Record<string, string>;
  aiUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; model: string } | null;
  expanded: boolean;
}


interface FieldEditorProps {
  fields: DocTypeField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  idPrefix: string;
}

function sanitizeFieldValue(field: DocTypeField, raw: string): string {
  const value = raw.trim();
  const isMatricula = field.field_key.toLowerCase().includes("matricula");

  if (isMatricula) {
    return value.replace(/\D/g, "");
  }
  if (field.field_type === "number" || field.field_type === "date") {
    return value;
  }
  return value.toUpperCase();
}

function FieldEditor({ fields, values, onChange, idPrefix }: FieldEditorProps) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {fields.map((f) => {
        const val = values[f.field_key] ?? "";
        const id = `${idPrefix}-${f.id}`;
        const isMatricula = f.field_key.toLowerCase().includes("matricula");
        return (
          <div key={f.id} className="space-y-0.5">
            <Label htmlFor={id} className="text-xs">
              {f.label} {f.required && <span className="text-destructive">*</span>}
            </Label>
            {f.field_type === "textarea" ? (
              <Textarea
                id={id}
                value={val}
                onChange={(e) => onChange(f.field_key, sanitizeFieldValue(f, e.target.value))}
                rows={2}
                className={cn("min-h-[48px] py-1 text-sm", isMatricula ? undefined : "uppercase")}
              />
            ) : f.field_type === "select" && Array.isArray(f.options) ? (
              <Select value={val} onValueChange={(v) => onChange(f.field_key, sanitizeFieldValue(f, v))}>
                <SelectTrigger className={cn("h-8 px-2 text-sm", isMatricula ? undefined : "uppercase")}>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {(f.options as string[]).map((o) => (
                    <SelectItem key={o} value={o} className={isMatricula ? undefined : "uppercase"}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={id}
                value={val}
                onChange={(e) => onChange(f.field_key, sanitizeFieldValue(f, e.target.value))}
                className={cn(
                  "h-8 px-2 text-sm",
                  isMatricula ? undefined : f.field_type !== "number" && f.field_type !== "date" ? "uppercase" : undefined,
                )}
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
  );
}

function PdfFilePreview({ file }: { file: File }) {
  const [data, setData] = useState<ArrayBuffer | null>(null);
  useEffect(() => {
    let cancelled = false;
    file.arrayBuffer().then((b) => {
      if (!cancelled) setData(b);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);
  if (!data) return <div className="text-xs text-muted-foreground">Carregando PDF…</div>;
  return <PdfPreview data={data} title={file.name} />;
}

interface ZoomablePreviewProps {
  children: ReactNode;
  initialScale?: number;
}

function ZoomablePreview({ children, initialScale = 1 }: ZoomablePreviewProps) {
  const [scale, setScale] = useState(initialScale);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 4)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.5)), []);
  const resetZoom = useCallback(() => setScale(initialScale), [initialScale]);

  return (
    <div className="relative w-full h-full overflow-auto" ref={containerRef}>
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-card/90 backdrop-blur rounded-md border border-border shadow-sm p-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={zoomOut}
          disabled={scale <= 0.5}
          className="h-7 w-7"
          title="Diminuir zoom"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={resetZoom}
          className="h-7 w-7"
          title="Redefinir zoom"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={zoomIn}
          disabled={scale >= 4}
          className="h-7 w-7"
          title="Aumentar zoom"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>
      <div
        className="origin-top-left transition-transform"
        style={{
          transform: `scale(${scale})`,
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
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
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const extractFn = useServerFn(extractFieldsWithGemini);

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
        previewUrl: URL.createObjectURL(file),
        status: "queued",
        progress: 0,
        fieldValues: {},
        expanded: true,
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
    setItems((prev) => {
      const it = prev.find((i) => i.id === id);
      if (it) URL.revokeObjectURL(it.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function setItemFieldValue(id: string, key: string, value: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, fieldValues: { ...i.fieldValues, [key]: value } } : i,
      ),
    );
  }

  async function handleAutoFillAll() {
    if (docTypeId === "none") return toast.error("Selecione o tipo de documento");
    if (fields.length === 0) return toast.error("Este tipo não tem campos de indexação");

    const queued = items.filter((i) => i.status === "queued");
    if (queued.length === 0) return toast.error("Nenhum arquivo na fila");

    setIsExtracting(true);
    const fieldDefs = fields.map((f) => ({
      label: f.label,
      field_key: f.field_key,
      field_type: f.field_type,
      options: f.options,
    }));
    const fieldsJson = JSON.stringify(fieldDefs);

    let ok = 0;
    let fail = 0;
    for (const item of queued) {
      try {
        const form = new FormData();
        form.append("file", item.file);
        form.append("fields", fieldsJson);
        if (companyId !== "none") form.append("companyId", companyId);
        if (docTypeId !== "none") form.append("documentTypeId", docTypeId);
        const res = (await extractFn({ data: form })) as {
          values: Record<string, string>;
          usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; model: string };
        };
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  fieldValues: { ...i.fieldValues, ...res.values },
                  aiUsage: res.usage,
                  expanded: true,
                }
              : i,
          ),
        );
        ok++;
      } catch (e: any) {
        fail++;
        toast.error(`${item.file.name}: ${e.message ?? "Falha na extração"}`);
      }
    }
    setIsExtracting(false);
    if (ok > 0) toast.success(`Preenchimento IA concluído (${ok} ok${fail ? `, ${fail} falha(s)` : ""}). Revise antes de enviar.`);
  }


  async function handleUploadAll() {
    if (!orgId || !userId) return toast.error("Organização não definida");
    if (companyId === "none") return toast.error("Selecione a empresa");
    if (docTypeId === "none") return toast.error("Selecione o tipo de documento");

    const queued = items.filter((i) => i.status === "queued");
    if (queued.length === 0) return;

    for (const item of queued) {
      for (const f of fields) {
        if (f.required && !String(item.fieldValues[f.field_key] ?? "").trim()) {
          toast.error(`${item.file.name}: campo obrigatório "${f.label}"`);
          updateItem(item.id, { expanded: true });
          return;
        }
      }
    }

    setIsUploading(true);

    for (const item of queued) {
      const err = validateFile(item.file);
      if (err) {
        updateItem(item.id, { status: "error", error: err });
        continue;
      }
      updateItem(item.id, { status: "uploading", progress: 0 });
      try {
        await uploadDocument({
          file: item.file,
          orgId,
          userId,
          name: item.file.name,
          documentTypeId: docTypeId,
          companyId,
          fieldValues: item.fieldValues,
          aiUsage: item.aiUsage ?? undefined,
          onProgress: (pct) => updateItem(item.id, { progress: pct }),
        });

        updateItem(item.id, { status: "done", progress: 100 });
      } catch (e: any) {
        updateItem(item.id, { status: "error", error: e.message ?? "Erro" });
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
          Selecione empresa e tipo, depois preencha a indexação de cada arquivo individualmente.
          Até {MAX_FILES_PER_BATCH} arquivos por lote. PDF, JPG, PNG, TIFF, WEBP — até 25 MB cada.
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
              }}
              disabled={companyId === "none"}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    companyId === "none" ? "Selecione a empresa primeiro" : "Selecionar"
                  }
                />
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
          <p className="text-sm text-muted-foreground mt-1">
            PDF, JPG, PNG, TIFF, WEBP • máx 25 MB
          </p>
        </div>

        {items.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">{items.length} arquivo(s) na fila</h3>
              <div className="flex gap-2 flex-wrap">
                {items.some((i) => i.status === "done") && (
                  <Button size="sm" variant="ghost" onClick={clearDone}>
                    Limpar finalizados
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAutoFillAll}
                  disabled={
                    isExtracting ||
                    isUploading ||
                    docTypeId === "none" ||
                    fields.length === 0 ||
                    !items.some((i) => i.status === "queued")
                  }
                  title="Lê a 1ª página de cada arquivo e preenche os campos via Gemini IA"
                >
                  {isExtracting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1" />
                  )}
                  Preencher com IA
                </Button>
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
                <li key={item.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
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
                    {item.status !== "done" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => updateItem(item.id, { expanded: !item.expanded })}
                        className="h-7 w-7"
                        title="Pré-visualizar e editar indexação"
                      >
                        {item.expanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
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
                  </div>
                  {item.expanded && item.status !== "done" && (
                    <div className="pl-8 pt-2 space-y-3 border-t">
                      <div className="grid lg:grid-cols-[1fr_300px] gap-4 pt-2">
                        <ZoomablePreview>
                          {item.file.type.startsWith("image/") ? (
                            <img
                              src={item.previewUrl}
                              alt={item.file.name}
                              className="max-h-[420px] max-w-full object-contain"
                            />
                          ) : item.file.type === "application/pdf" ? (
                            <div className="w-[800px] h-[420px]">
                              <PdfFilePreview file={item.file} />
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground p-4 text-center">
                              Pré-visualização indisponível para este tipo de arquivo.
                            </div>
                          )}
                        </ZoomablePreview>
                        <div className="space-y-3">
                          {fields.length > 0 ? (
                            <FieldEditor
                              fields={fields}
                              values={item.fieldValues}
                              onChange={(k, v) => setItemFieldValue(item.id, k, v)}
                              idPrefix={item.id}
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Selecione um tipo de documento para preencher a indexação.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
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
