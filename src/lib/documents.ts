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

export async function getSignedUrl(storagePath: string, expiresIn = 60): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, expiresIn);
  if (error) {
    console.error("signed url", error);
    return null;
  }
  return data.signedUrl;
}

export interface UploadOptions {
  file: File;
  orgId: string;
  userId: string;
  name: string;
  documentTypeId: string | null;
  tags: string[];
  onProgress?: (pct: number) => void;
}

export async function uploadDocument(opts: UploadOptions): Promise<DocumentRow> {
  const { file, orgId, userId, name, documentTypeId, tags } = opts;

  // 1. Create draft row to get id
  const { data: draft, error: insertErr } = await supabase
    .from("documents")
    .insert({
      org_id: orgId,
      uploaded_by: userId,
      name,
      original_filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      storage_path: "pending",
      document_type_id: documentTypeId,
      tags,
      status: "pending",
    })
    .select("*")
    .single();
  if (insertErr || !draft) throw insertErr ?? new Error("Falha ao criar documento");

  const storagePath = `${orgId}/${draft.id}/${file.name}`;

  // 2. Upload to storage
  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (upErr) {
    await supabase.from("documents").update({
      status: "failed",
      error_message: upErr.message,
    }).eq("id", draft.id);
    throw upErr;
  }

  // 3. Finalize: mark processed (no OCR yet)
  const { data: final, error: finErr } = await supabase
    .from("documents")
    .update({ status: "processed", storage_path: storagePath })
    .eq("id", draft.id)
    .select("*")
    .single();

  if (finErr || !final) throw finErr ?? new Error("Falha ao finalizar");
  opts.onProgress?.(100);
  return final;
}
