import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfPreview } from "@/components/pdf-preview";
import type { DocumentRow } from "@/lib/documents";

export interface DocumentPreviewContentProps {
  doc: DocumentRow;
  url: string | null;
  fileData: ArrayBuffer | null;
  loading: boolean;
  scrollable?: boolean;
}

export function DocumentPreviewContent({ doc, url, fileData, loading }: DocumentPreviewContentProps) {
  const isImage = doc.mime_type.startsWith("image/");
  const isPdf = doc.mime_type === "application/pdf";

  return (
    <div className="flex-1 h-full w-full overflow-hidden grid place-items-center relative min-h-0">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {!loading && !url && (
        <div className="text-center text-muted-foreground p-6">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
          Não foi possível carregar a pré-visualização
        </div>
      )}
      {url && isImage && (
        <div className="w-full h-full flex items-center justify-center p-4">
          <img src={url} alt={doc.name} className="max-w-full max-h-full object-contain shadow-sm" />
        </div>
      )}
      {url && isPdf && fileData && <PdfPreview data={fileData} title={doc.name} />}
      {url && !isImage && !isPdf && (
        <div className="text-center text-muted-foreground p-6">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
          Formato sem pré-visualização. Use "Baixar".
        </div>
      )}
    </div>
  );
}