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
 * Returns a URL the browser can use to view/download the file. The file is
 * streamed from Google Drive via our authenticated /api/files/:id route.
 * Uses the current Supabase session token as a short-lived query param so
 * <iframe>/<img> elements (which can't send Authorization headers) still work.
 */
export async function getFileUrl(documentId: string, opts: { download?: boolean } = {}): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  const params = new URLSearchParams({ token });
  if (opts.download) params.set("download", "1");
  return `/api/files/${documentId}?${params.toString()}`;
}

export interface UploadOptions {
  file: File;
  orgId: string;
  userId: string;
  name: string;
  documentTypeId: string | null;
  companyId?: string | null;
  fieldValues?: Record<string, unknown>;
  tags: string[];
  onProgress?: (pct: number) => void;
}

export async function uploadDocument(opts: UploadOptions): Promise<DocumentRow> {
  const { file, orgId, userId, name, documentTypeId, companyId, fieldValues, tags } = opts;

  // 1. Create draft row (server fn needs the id to attach the Drive file).
  const { data: draft, error: insertErr } = await supabase
    .from("documents")
    .insert({
      org_id: orgId,
      uploaded_by: userId,
      name,
      original_filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      document_type_id: documentTypeId,
      company_id: companyId ?? null,
      field_values: (fieldValues ?? {}) as any,
      tags,
      status: "processing",
    })
    .select("*")
    .single();
  if (insertErr || !draft) throw insertErr ?? new Error("Falha ao criar documento");


  opts.onProgress?.(10);

  // 2. Upload to Google Drive via server fn.
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("documentId", draft.id);

  try {
    const final = await uploadDocumentToDrive({ data: form });
    opts.onProgress?.(100);
    // Use type assertion for the returned value since server functions are wrapped
    return final as any as DocumentRow;
  } catch (err) {
    // Server fn already marks the doc as failed; surface the message.
    throw err instanceof Error ? err : new Error(String(err));
  }
}
