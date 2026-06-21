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
 * Returns a signed URL for the file stored in Supabase Storage (private
 * bucket "documents"). The URL is valid for 1 hour and can be used directly
 * by <img>/<iframe> tags.
 */
export async function getFileUrl(
  documentId: string,
  opts: { download?: boolean } = {},
): Promise<string | null> {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("storage_path, original_filename, drive_web_view_link")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !doc) return null;

  if (doc.storage_path) {
    const { data, error: signErr } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 3600, {
        download: opts.download ? doc.original_filename : false,
      });
    if (signErr || !data) return null;
    return data.signedUrl;
  }

  // Legacy fallback: documents uploaded before storage migration live on Drive.
  // Use the /preview endpoint which is embeddable in iframes.
  const link = doc.drive_web_view_link;
  if (!link) return null;
  return link.replace("/view", "/preview");
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

  opts.onProgress?.(10);

  // 1. Upload binary to Supabase Storage (private bucket).
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const objectName = `${crypto.randomUUID()}${ext ? "." + ext : ""}`;
  const storagePath = `${orgId}/${objectName}`;

  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (upErr) throw upErr;

  opts.onProgress?.(80);

  // 2. Create the document row pointing at the uploaded object.
  const { data: row, error: insertErr } = await supabase
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
      storage_path: storagePath,
      status: "processed",
    })
    .select("*")
    .single();

  if (insertErr || !row) {
    // Roll back the orphan storage object.
    await supabase.storage.from("documents").remove([storagePath]).catch(() => {});
    throw insertErr ?? new Error("Falha ao criar documento");
  }

  opts.onProgress?.(100);
  return row;
}

