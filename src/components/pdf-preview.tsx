import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export interface PdfPreviewProps {
  data: ArrayBuffer;
  title: string;
}

export function PdfPreview({ data, title }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderFirstPage() {
      setIsRendering(true);
      setFailed(false);

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const loadingTask = pdfjs.getDocument({ data: data.slice(0) });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const containerWidth = canvas.parentElement?.clientWidth ?? 900;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(containerWidth / baseViewport.width, 1.8);
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas indisponível");

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        await page.render({ canvasContext: context, viewport }).promise;
        await pdf.destroy();
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }

    renderFirstPage();

    return () => {
      cancelled = true;
    };
  }, [data]);

  return (
    <div className="w-full h-full overflow-auto bg-muted/40 p-4">
      <div className="min-h-full grid place-items-start justify-center">
        {isRendering && (
          <div className="absolute inset-0 grid place-items-center bg-muted/30">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {failed ? (
          <p className="text-sm text-muted-foreground">Não foi possível pré-visualizar este PDF.</p>
        ) : (
          <canvas ref={canvasRef} aria-label={title} className="max-w-full bg-card shadow-sm" />
        )}
      </div>
    </div>
  );
}