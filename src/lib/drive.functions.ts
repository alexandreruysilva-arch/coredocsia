import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Upload via multipart FormData. Server fn cria a hierarquia de pastas
// (Org → Empresa → Tipo) no Google Drive, faz o upload binário e
// insere a linha em `documents`. Retorna a row final.
//
// Campos esperados:
//   file              File (obrigatório)
//   name              string (obrigatório)
//   companyId         uuid (obrigatório)
//   documentTypeId    uuid (obrigatório)
//   tags              string CSV (opcional)
//   fieldValues       JSON string (opcional)
export const uploadDocumentToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("FormData esperado");
    const file = data.get("file");
    const name = data.get("name");
    const companyId = data.get("companyId");
    const documentTypeId = data.get("documentTypeId");
    const tagsRaw = data.get("tags");
    const fieldValuesRaw = data.get("fieldValues");
    if (!(file instanceof File)) throw new Error("Arquivo ausente");
    if (typeof name !== "string" || !name.trim()) throw new Error("Nome ausente");
    if (typeof companyId !== "string") throw new Error("companyId ausente");
    if (typeof documentTypeId !== "string") throw new Error("documentTypeId ausente");
    const tags =
      typeof tagsRaw === "string" && tagsRaw.trim()
        ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : [];
    let fieldValues: Record<string, unknown> = {};
    if (typeof fieldValuesRaw === "string" && fieldValuesRaw.trim()) {
      try {
        fieldValues = JSON.parse(fieldValuesRaw) as Record<string, unknown>;
      } catch {
        throw new Error("fieldValues inválido");
      }
    }
    const aiUsageRaw = data.get("aiUsage");
    let aiUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; model?: string } | null = null;
    if (typeof aiUsageRaw === "string" && aiUsageRaw.trim()) {
      try {
        aiUsage = JSON.parse(aiUsageRaw) as typeof aiUsage;
      } catch {
        throw new Error("aiUsage inválido");
      }
    }
    return { file, name, companyId, documentTypeId, tags, fieldValues, aiUsage };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!userId) throw new Error("Usuário não autenticado");
    const { file, name, companyId, documentTypeId, tags, fieldValues } = data;

    const { ensureCompanyFolder, ensureDocTypeFolder, uploadFileToDrive } =
      await import("./drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Verifica empresa + tipo e descobre org_id via RLS.
    const { data: company, error: compErr } = await supabase
      .from("companies")
      .select("id, org_id, name, drive_folder_id")
      .eq("id", companyId)
      .single();
    if (compErr || !company) throw new Error("Empresa não encontrada ou sem acesso");

    const { data: docType, error: dtErr } = await supabase
      .from("document_types")
      .select("id, org_id, name, drive_folder_id, company_id")
      .eq("id", documentTypeId)
      .single();
    if (dtErr || !docType) throw new Error("Tipo de documento não encontrado");
    if (docType.org_id !== company.org_id) throw new Error("Tipo de documento de outra organização");

    // 2. Garante pasta da empresa na raiz do Drive: "Lovable - <Empresa>".
    let companyFolderId = company.drive_folder_id;
    if (!companyFolderId) {
      companyFolderId = await ensureCompanyFolder(null, company.id, company.name);
      await supabaseAdmin
        .from("companies")
        .update({ drive_folder_id: companyFolderId })
        .eq("id", company.id);
    }


    // 4. Garante pasta do tipo de documento (cache global no tipo, mas única por empresa via scopeKey).
    const scopeKey = `${company.id}:${docType.id}`;
    let docTypeFolderId = docType.drive_folder_id;
    if (!docTypeFolderId) {
      docTypeFolderId = await ensureDocTypeFolder(companyFolderId, scopeKey, docType.name);
      await supabaseAdmin
        .from("document_types")
        .update({ drive_folder_id: docTypeFolderId })
        .eq("id", docType.id);
    }

    // 5. Upload binário.
    const buffer = await file.arrayBuffer();
    const uploaded = await uploadFileToDrive({
      folderId: docTypeFolderId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      body: buffer,
      appProperties: {
        lovableOrgId: company.org_id,
        lovableCompanyId: company.id,
        lovableDocTypeId: docType.id,
        uploadedBy: userId,
      },
    });

    // 6. Cria a linha em documents.
    const { data: row, error: insertErr } = await supabase
      .from("documents")
      .insert({
        org_id: company.org_id,
        uploaded_by: userId,
        name,
        original_filename: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        document_type_id: docType.id,
        company_id: company.id,
        field_values: fieldValues as never,
        tags,
        storage_path: null,
        drive_file_id: uploaded.id,
        drive_web_view_link: uploaded.webViewLink ?? null,
        status: "processed",
      })
      .select("*")
      .single();

    if (insertErr || !row) {
      const { deleteDriveFile } = await import("./drive.server");
      await deleteDriveFile(uploaded.id).catch(() => {});
      throw insertErr ?? new Error("Falha ao criar documento");
    }
    return row;
  });

export const deleteDocumentFromDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string }) => {
    if (!data || typeof data.documentId !== "string") throw new Error("documentId ausente");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!userId) throw new Error("Usuário não autenticado");
    const { deleteDriveFile } = await import("./drive.server");
    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, drive_file_id")
      .eq("id", data.documentId)
      .single();
    if (error || !doc) throw new Error("Documento não encontrado");
    if (doc.drive_file_id) {
      try {
        await deleteDriveFile(doc.drive_file_id);
      } catch (e) {
        console.error("drive delete failed", e);
      }
    }
    const { error: delErr } = await supabase.from("documents").delete().eq("id", data.documentId);
    if (delErr) throw delErr;
    return { ok: true };
  });
