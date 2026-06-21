import { useEffect, useState } from "react";
import { Loader2, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFileUrl, type DocumentRow } from "@/lib/documents";

export function DocumentViewer({ doc }: { doc: DocumentRow }) {
  const [url, setUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setUrl(null);
    setDownloadUrl(null);
    Promise.all([getFileUrl(doc.id), getFileUrl(doc.id, { download: true })]).then(([viewUrl, dlUrl]) => {
      if (!active) return;
      setUrl(viewUrl);
      setDownloadUrl(dlUrl);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [doc.id]);

  const isImage = doc.mime_type.startsWith("image/");
  const isPdf = doc.mime_type === "application/pdf";

  return (
    <div className="flex flex-col h-full bg-muted/30">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{doc.name}</p>
          <p className="text-xs text-muted-foreground truncate">{doc.original_filename}</p>
        </div>
        <div className="flex items-center gap-2">
          {url && (
            <Button asChild size="sm" variant="outline">
              <a href={url} target="_blank" rel="noreferrer">Abrir</a>
            </Button>
          )}
          {downloadUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={downloadUrl} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4 mr-1.5" /> Baixar
              </a>
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden grid place-items-center relative">
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
            <img 
              src={url} 
              alt={doc.name} 
              className={`max-w-full max-h-full object-contain shadow-sm transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`} 
            />
          </div>
        )}
        {url && isPdf && (
          <object data={url} type="application/pdf" className="w-full h-full bg-white">
            <iframe src={url} title={doc.name} className="w-full h-full bg-white" />
          </object>
        )}
        {url && !isImage && !isPdf && (
          <div className="text-center text-muted-foreground p-6">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
            Formato sem pré-visualização. Use "Baixar".
          </div>
        )}
      </div>
    </div>
  );
}
