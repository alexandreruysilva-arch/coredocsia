import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

export interface PdfPreviewProps {
  data: ArrayBuffer;
  title: string;
}

export function PdfPreview({ data, title }: PdfPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([data.slice(0)], { type: "application/pdf" });
    const objectUrl = URL.createObjectURL(blob);
    setPdfUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [data]);

  return (
    <div className="relative w-full h-full min-h-[320px] bg-muted/40">
      {!pdfUrl ? (
        <div className="absolute inset-0 grid place-items-center bg-muted/30">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <object
          data={pdfUrl}
          type="application/pdf"
          aria-label={title}
          className="h-full w-full bg-card"
        >
          <div className="h-full w-full grid place-items-center p-6 text-center text-sm text-muted-foreground">
            <div>
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p>Não foi possível exibir o PDF no navegador.</p>
              <p className="mt-1">Use “Baixar” para abrir o arquivo original.</p>
            </div>
          </div>
        </object>
      )}
    </div>
  );
}
