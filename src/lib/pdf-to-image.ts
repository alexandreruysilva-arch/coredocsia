/**
 * Renderiza a PRIMEIRA página de um PDF em uma imagem PNG (File)
 * usando pdfjs-dist no navegador. Útil para provedores de IA que só
 * aceitam imagens (ex.: Grok/xAI).
 */
export async function pdfFirstPageToPng(file: File, scale = 2): Promise<File> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  try {
    const page = await pdf.getPage(1);
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
    const baseName = file.name.replace(/\.pdf$/i, "") || "documento";
    return new File([blob], `${baseName}-p1.png`, { type: "image/png" });
  } finally {
    (pdf as unknown as { destroy?: () => void }).destroy?.();
  }
}
