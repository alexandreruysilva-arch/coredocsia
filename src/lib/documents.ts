import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";


export type DocStatus = Database["public"]["Enums"]["doc_status"];
export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type DocumentTypeRow = Database["public"]["Tables"]["document_types"]["Row"];

export const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
];
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_BATCH = 20;

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) return "Arquivo excede 25 MB";
  if (!ALLOWED_MIME.includes(file.type)) return "Tipo de arquivo não suportado";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export const STATUS_LABEL: Record<DocStatus, string> = {
  pending: "Pendente",
  processing: "Processando",
  processed: "Processado",
  failed: "Falhou",
};

/**
 * Retorna URL para visualizar/baixar o arquivo. Usa a rota TanStack
 * /api/files/$id que faz proxy autenticado para o Google Drive.
 */
export async function getFileUrl(
  documentId: string,
  opts: { download?: boolean } = {},
): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;
  const qs = new URLSearchParams({ token });
  if (opts.download) qs.set("download", "1");
  return `/api/public/files/${documentId}?${qs.toString()}`;
}

export interface UploadOptions {
  file: File;
  orgId: string;
  userId: string;
  name: string;
  documentTypeId: string;
  companyId: string;
  fieldValues?: Record<string, unknown>;
  tags: string[];
  onProgress?: (pct: number) => void;
}

export async function uploadDocument(opts: UploadOptions): Promise<DocumentRow> {
  const { file, name, documentTypeId, companyId, fieldValues, tags } = opts;

  opts.onProgress?.(10);

  const { uploadDocumentToDrive } = await import("./drive.functions");

  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  form.append("companyId", companyId);
  form.append("documentTypeId", documentTypeId);
  form.append("tags", tags.join(","));
  form.append("fieldValues", JSON.stringify(fieldValues ?? {}));

  opts.onProgress?.(40);
  const row = await uploadDocumentToDrive({ data: form });
  opts.onProgress?.(100);
  return row as DocumentRow;
}


