/**
 * Renderiza páginas de um PDF em imagens PNG (File[]) usando pdfjs-dist
 * no navegador. Útil para provedores de IA que só aceitam imagens (ex.: Grok/xAI).
 */
async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
}

/**
 * Renderiza APENAS a primeira página. Mantido para compatibilidade.
 */
export async function pdfFirstPageToPng(file: File, scale = 2): Promise<File> {
  const [first] = await pdfPagesToPngs(file, 1, scale);
  return first;
}

/**
 * Renderiza as primeiras `maxPages` páginas do PDF em PNGs.
 * Retorna 1 arquivo por página, nomeados como `<base>-p{n}.png`.
 */
export async function pdfPagesToPngs(
  file: File,
  maxPages = 1,
  scale = 2,
): Promise<File[]> {
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const files: File[] = [];
  const baseName = file.name.replace(/\.pdf$/i, "") || "documento";
  const total = Math.min(pdf.numPages, Math.max(1, maxPages | 0));
  try {
    for (let n = 1; n <= total; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível para renderizar PDF");
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar PNG do PDF"))),
          "image/png",
        ),
      );
      files.push(new File([blob], `${baseName}-p${n}.png`, { type: "image/png" }));
    }
    return files;
  } finally {
    (pdf as unknown as { destroy?: () => void }).destroy?.();
  }
}
