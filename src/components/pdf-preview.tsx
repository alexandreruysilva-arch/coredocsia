import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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
        <iframe
          src={pdfUrl}
          title={title}
          className="h-full w-full border-0 bg-card"
        />
      )}
    </div>
  );
}
