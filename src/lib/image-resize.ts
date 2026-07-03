/**
 * Redimensiona imagens no cliente antes de enviar para a IA,
 * reduzindo tokens/custo (Gemini cobra por tiles de 768px).
 * PDFs e formatos não suportados passam sem alteração.
 */
const RESIZABLE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MAX_EDGE = 1280; // >768 preserva 1 tile extra de qualidade
const JPEG_QUALITY = 0.82;

export interface ResizeOptions {
  maxEdge?: number;
  quality?: number;
}

export async function resizeImageForAI(file: File, opts: ResizeOptions = {}): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!RESIZABLE_MIME.has(file.type)) return file;

  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = opts.quality ?? JPEG_QUALITY;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const longest = Math.max(width, height);
    if (longest <= maxEdge) {
      bitmap.close?.();
      return file;
    }
    const scale = maxEdge / longest;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(targetW, targetH)
        : Object.assign(document.createElement("canvas"), { width: targetW, height: targetH });
    const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const outType = "image/jpeg";
    const blob: Blob =
      "convertToBlob" in canvas
        ? await (canvas as OffscreenCanvas).convertToBlob({ type: outType, quality })
        : await new Promise<Blob>((resolve, reject) => {
            (canvas as HTMLCanvasElement).toBlob(
              (b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))),
              outType,
              quality,
            );
          });

    if (blob.size >= file.size) return file; // não piora
    const newName = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
    return new File([blob], newName, { type: outType, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
