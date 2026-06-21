import { useEffect, useState } from "react";
import { Download, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFileUrl, type DocumentRow } from "@/lib/documents";
import { useDocumentTypeFields } from "@/hooks/use-document-type-fields";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DocumentPreviewContent } from "@/components/document-preview-content";

export function DocumentViewer({ doc }: { doc: DocumentRow }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    setLoading(true);
    setUrl(null);
    setFileData(null);

    getFileUrl(doc.id)
      .then(async (viewUrl) => {
        if (!viewUrl) throw new Error("Sessão não encontrada");

        const response = await fetch(viewUrl);
        if (!response.ok) throw new Error(`Falha ao carregar arquivo (${response.status})`);

        const data = await response.arrayBuffer();
        const blob = new Blob([data], { type: doc.mime_type || "application/octet-stream" });
        objectUrl = URL.createObjectURL(blob);

        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setUrl(objectUrl);
        setFileData(data);
      })
      .catch(() => {
        if (active) setUrl(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id, doc.mime_type]);

  const { data: fields } = useDocumentTypeFields(doc.document_type_id);
  const values = (doc.field_values ?? {}) as Record<string, unknown>;
  const formatValue = (v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    return String(v);
  };


  return (
    <div className="flex flex-col h-full bg-muted/30">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{doc.name}</p>
          <p className="text-xs text-muted-foreground truncate">{doc.original_filename}</p>
        </div>
        <div className="flex items-center gap-2">
          {url && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExpanded(true)}
            >
              <Maximize2 className="h-4 w-4 mr-1.5" />
              Abrir
            </Button>
          )}
          {url && (
            <Button asChild size="sm" variant="outline">
              <a href={url} download={doc.original_filename}>
                <Download className="h-4 w-4 mr-1.5" /> Baixar
              </a>
            </Button>
          )}
        </div>
      </div>
      <DocumentPreviewContent doc={doc} url={url} fileData={fileData} loading={loading} />
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[96vw] h-[92vh] p-0 gap-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-card min-w-0">
            <DialogTitle className="text-sm truncate pr-8">{doc.name}</DialogTitle>
            <p className="text-xs text-muted-foreground truncate">{doc.original_filename}</p>
          </div>
          <DocumentPreviewContent doc={doc} url={url} fileData={fileData} loading={loading} />
        </DialogContent>
      </Dialog>
      {fields && fields.length > 0 && (
        <div className="border-t border-border bg-card p-4 max-h-[40%] overflow-y-auto">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">
            Campos de indexação
          </h3>
          <dl className="grid grid-cols-1 gap-y-2 text-sm">
            {fields.map((f) => (
              <div key={f.id} className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="font-medium break-words">{formatValue(values[f.field_key])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
