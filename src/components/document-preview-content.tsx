import { useState } from "react";
import { FileText, Loader2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PdfPreview } from "@/components/pdf-preview";
import type { DocumentRow } from "@/lib/documents";

export interface DocumentPreviewContentProps {
  doc: DocumentRow;
  url: string | null;
  fileData: ArrayBuffer | null;
  loading: boolean;
  scrollable?: boolean;
  zoomable?: boolean;
}

export function DocumentPreviewContent({
  doc,
  url,
  fileData,
  loading,
  scrollable = false,
  zoomable = false,
}: DocumentPreviewContentProps) {
  const [zoom, setZoom] = useState(1);
  const minZoom = 0.5;
  const maxZoom = 3;
  const step = 0.25;

  const zoomIn = () => setZoom((z) => Math.min(maxZoom, Number((z + step).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(minZoom, Number((z - step).toFixed(2))));
  const resetZoom = () => setZoom(1);

  const isImage = doc.mime_type.startsWith("image/");
  const isPdf = doc.mime_type === "application/pdf";

  return (
    <div
      className={cn(
        "flex-1 w-full grid place-items-center relative min-h-0",
        scrollable ? "overflow-auto" : "h-full overflow-hidden",
      )}
    >
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
        <>
          <div
            className={cn(
              "w-full flex items-start justify-center p-4",
              scrollable ? "min-h-full py-8" : "h-full",
            )}
          >
            <img
              src={url}
              alt={doc.name}
              className={cn(
                "max-w-none object-contain shadow-sm",
                scrollable ? "h-auto" : "max-h-full",
              )}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top center",
              }}
            />
          </div>
          {zoomable && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-full bg-card/95 backdrop-blur border shadow-sm z-20">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Afastar zoom"
                disabled={zoom <= minZoom}
                onClick={zoomOut}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Aproximar zoom"
                disabled={zoom >= maxZoom}
                onClick={zoomIn}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Redefinir zoom"
                disabled={zoom === 1}
                onClick={resetZoom}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
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
