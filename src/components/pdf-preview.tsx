import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PdfPreviewProps {
  data: ArrayBuffer;
  title: string;
}

export function PdfPreview({ data, title }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRef = useRef<any>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    let loadingTask: any = null;

    async function loadPdf() {
      setIsRendering(true);
      setFailed(false);
      setPageNumber(1);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        loadingTask = pdfjs.getDocument({
          data: data.slice(0),
          isOffscreenCanvasSupported: false,
          isImageDecoderSupported: false,
          useWorkerFetch: false,
        });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
      } catch (error) {
        console.error("Falha ao carregar PDF", error);
        if (!cancelled) setFailed(true);
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
      if (pdfRef.current) {
        pdfRef.current.destroy?.();
        pdfRef.current = null;
      }
    };
  }, [data]);

  // Render current page
  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;

    async function renderPage() {
      const pdf = pdfRef.current;
      const canvas = canvasRef.current;
      if (!pdf || !canvas) return;
      setIsRendering(true);
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const availableWidth = canvas.parentElement?.clientWidth ?? 360;
        const containerWidth = Math.min(Math.max(availableWidth, 280), 360);
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = Math.min(containerWidth / baseViewport.width, 0.8);
        const dpr = Math.min((window.devicePixelRatio || 1) * 2.5, 4);
        const renderScale = cssScale * dpr;
        const cssViewport = page.getViewport({ scale: cssScale });
        const viewport = page.getViewport({ scale: renderScale });
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas indisponível");

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;

        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error: any) {
        if (error?.name !== "RenderingCancelledException") {
          console.error("Falha ao renderizar PDF", error);
          if (!cancelled) setFailed(true);
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }

    renderPage();
    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel?.();
    };
  }, [pageNumber, numPages]);

  const canPrev = pageNumber > 1;
  const canNext = pageNumber < numPages;

  return (
    <div className="relative w-full flex flex-col">
      {numPages > 0 && (
        <div className="flex items-center justify-start gap-1.5 px-2 py-1.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canPrev}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums px-1">
            Página {pageNumber} de {numPages || 1}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canNext}
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <div className="relative max-h-[340px] overflow-auto">
        {isRendering && (
          <div className="absolute inset-0 grid place-items-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {failed ? (
          <div className="max-w-sm text-center text-sm text-muted-foreground p-6 mx-auto">
            <p>Não foi possível renderizar a página do PDF.</p>
            <p className="mt-1">Use "Baixar" para abrir o arquivo original.</p>
          </div>
        ) : (
          <canvas ref={canvasRef} aria-label={title} className="max-w-full block mx-auto" />
        )}
      </div>
    </div>
  );
}
