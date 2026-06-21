import { useMemo, useState, useCallback } from "react";
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
  Copy,
} from "lucide-react";
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
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  fieldValues: Record<string, string>;
  tags: string;
  expanded: boolean;
}

interface FieldEditorProps {
  fields: DocTypeField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  idPrefix: string;
}

function FieldEditor({ fields, values, onChange, idPrefix }: FieldEditorProps) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {fields.map((f) => {
        const val = values[f.field_key] ?? "";
        const id = `${idPrefix}-${f.id}`;
        return (
          <div key={f.id} className="space-y-1.5">
            <Label htmlFor={id} className="text-xs">
              {f.label} {f.required && <span className="text-destructive">*</span>}
            </Label>
            {f.field_type === "textarea" ? (
              <Textarea
                id={id}
                value={val}
                onChange={(e) => onChange(f.field_key, e.target.value)}
                rows={2}
              />
            ) : f.field_type === "select" && Array.isArray(f.options) ? (
              <Select value={val} onValueChange={(v) => onChange(f.field_key, v)}>
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
                id={id}
                value={val}
                onChange={(e) => onChange(f.field_key, e.target.value)}
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
  const [defaultTags, setDefaultTags] = useState("");
  const [defaultValues, setDefaultValues] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [batchMode, setBatchMode] = useState(true);

  const types = useMemo(() => {
    let list = allTypes;
    if (companyId !== "none") list = list.filter((t: any) => t.company_id === companyId);
    if (allowedTypeIds) list = list.filter((t) => allowedTypeIds.includes(t.id));
    return list;
  }, [allTypes, companyId, allowedTypeIds]);

  const { data: fields = [] } = useDocumentTypeFields(
    docTypeId !== "none" ? docTypeId : null,
  );

  const onDrop = useCallback(
    (accepted: File[], rejected: any[]) => {
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
          fieldValues: { ...defaultValues },
          tags: defaultTags,
          expanded: false,
        }));
        return [...prev, ...toAdd];
      });
    },
    [defaultValues, defaultTags],
  );

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

  function applyDefaultsToAll() {
    setItems((prev) =>
      prev.map((i) =>
        i.status === "queued"
          ? { ...i, fieldValues: { ...defaultValues }, tags: defaultTags }
          : i,
      ),
    );
    toast.success("Valores aplicados a todos os arquivos pendentes");
  }

  async function handleUploadAll() {
    if (!orgId || !userId) return toast.error("Organização não definida");
    if (companyId === "none") return toast.error("Selecione a empresa");
    if (docTypeId === "none") return toast.error("Selecione o tipo de documento");

    const queued = items.filter((i) => i.status === "queued");
    if (queued.length === 0) return;

    // In batch mode, apply defaults to every queued item before validating
    if (batchMode) {
      for (const f of fields) {
        if (f.required && !String(defaultValues[f.field_key] ?? "").trim()) {
          toast.error(`Campo obrigatório no lote: "${f.label}"`);
          return;
        }
      }
    } else {
      for (const item of queued) {
        for (const f of fields) {
          if (f.required && !String(item.fieldValues[f.field_key] ?? "").trim()) {
            toast.error(`${item.file.name}: campo obrigatório "${f.label}"`);
            updateItem(item.id, { expanded: true });
            return;
          }
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
        const effectiveValues = batchMode ? defaultValues : item.fieldValues;
        const effectiveTagsStr = batchMode ? defaultTags : item.tags;
        const tags = effectiveTagsStr
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        await uploadDocument({
          file: item.file,
          orgId,
          userId,
          name: item.file.name,
          documentTypeId: docTypeId,
          companyId,
          fieldValues: effectiveValues,
          tags,
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
          Selecione empresa e tipo, preencha valores padrão e ajuste a indexação por arquivo. Até{" "}
          {MAX_FILES_PER_BATCH} arquivos por lote. PDF, JPG, PNG, TIFF, WEBP — até 25 MB cada.
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
                setDefaultValues({});
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
                setDefaultValues({});
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

        {fields.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-medium">
                  {batchMode ? "Indexação em lote (aplicada a todos)" : "Valores padrão de indexação"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {batchMode
                    ? "Os valores abaixo serão usados em todos os arquivos do lote."
                    : "Preencha valores padrão e ajuste por arquivo conforme necessário."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={batchMode ? "default" : "outline"}
                  onClick={() => setBatchMode(true)}
                >
                  Lote
                </Button>
                <Button
                  size="sm"
                  variant={!batchMode ? "default" : "outline"}
                  onClick={() => setBatchMode(false)}
                >
                  Por arquivo
                </Button>
                {!batchMode && items.some((i) => i.status === "queued") && (
                  <Button size="sm" variant="outline" onClick={applyDefaultsToAll}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Aplicar a todos
                  </Button>
                )}
              </div>
            </div>
            <FieldEditor
              fields={fields}
              values={defaultValues}
              onChange={(k, v) => setDefaultValues((p) => ({ ...p, [k]: v }))}
              idPrefix="default"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Tags padrão (separadas por vírgula)</Label>
          <Input
            value={defaultTags}
            onChange={(e) => setDefaultTags(e.target.value)}
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
          <p className="text-sm text-muted-foreground mt-1">
            PDF, JPG, PNG, TIFF, WEBP • máx 25 MB
          </p>
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
                    {!batchMode && fields.length > 0 && item.status !== "done" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => updateItem(item.id, { expanded: !item.expanded })}
                        className="h-7 w-7"
                        title="Editar indexação"
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
                  {!batchMode && item.expanded && fields.length > 0 && item.status !== "done" && (
                    <div className="pl-8 pt-2 space-y-3 border-t">
                      <FieldEditor
                        fields={fields}
                        values={item.fieldValues}
                        onChange={(k, v) => setItemFieldValue(item.id, k, v)}
                        idPrefix={item.id}
                      />
                      <div className="space-y-1.5">
                        <Label className="text-xs">Tags</Label>
                        <Input
                          value={item.tags}
                          onChange={(e) => updateItem(item.id, { tags: e.target.value })}
                          placeholder="separadas por vírgula"
                        />
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
