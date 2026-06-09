
# Upload + Fila + GED básica

Esta fase entrega o fluxo end-to-end de entrada de documentos: o usuário envia arquivos, eles aparecem em uma fila com status, e ficam disponíveis em uma GED (Gestão Eletrônica de Documentos) básica para consulta, visualização e download.

## Escopo desta entrega

1. **Storage** — bucket privado `documents` no Lovable Cloud, com políticas que restringem leitura/escrita ao caminho `{org_id}/{document_id}/...` por membros da organização.
2. **Upload** (`/upload`) — drag-and-drop múltiplo (PDF, JPG, PNG, TIFF, até 25 MB cada), barra de progresso por arquivo, validação de tipo/tamanho, classificação opcional (tipo do documento + tags livres) antes do envio.
3. **Fila de processamento** (`/queue`) — lista paginada de uploads com status (`pending`, `processing`, `processed`, `failed`), filtros por status/uploader/data, ação de reprocessar (stub para a próxima fase de OCR) e cancelar. Atualização em tempo real via Supabase Realtime.
4. **GED básica** (`/documents`) — lista de documentos processados com busca por nome, filtros (tipo, tag, data, uploader), visualizador inline (PDF/imagem) em painel lateral, download via URL assinada, edição de metadados (nome, tipo, tags) e exclusão lógica (soft delete) restrita a `operator+`.
5. **Detalhe do documento** (`/documents/$id`) — página com pré-visualização, metadados completos, histórico de versões (placeholder) e ações.

## Não está nesta entrega

OCR / extração de campos por IA, templates de extração, criação de grupos/lotes, workflow de aprovação, retenção/expurgo, créditos/cobrança, busca full-text no conteúdo. A fila já reserva o status `processing`/`failed` para essas etapas futuras.

## Detalhes técnicos

### Tabelas (uma migration)
- `document_types(id, org_id, name, slug, created_at)` — tipos configuráveis por organização (seed: "Nota Fiscal", "Contrato", "RG/CNH", "Comprovante", "Outro").
- `documents(id, org_id, uploaded_by, name, original_filename, mime_type, size_bytes, storage_path, document_type_id nullable, tags text[], status doc_status, error_message, page_count nullable, created_at, updated_at, deleted_at nullable)`
- Enum `doc_status`: `pending | processing | processed | failed`.
- Índices: `(org_id, status, created_at desc)`, `(org_id, document_type_id)`, GIN em `tags`.
- RLS em todas: SELECT/UPDATE/INSERT restritos a `is_org_member(auth.uid(), org_id)`; DELETE só para `org_admin` (soft delete via UPDATE `deleted_at`).
- GRANTs para `authenticated` e `service_role`.
- Trigger `tg_set_updated_at` reutilizado.

### Storage
- Bucket `documents` privado.
- Política `storage.objects`: membros da org podem `SELECT/INSERT/DELETE` quando `(storage.foldername(name))[1] = org_id::text` E `is_org_member(auth.uid(), org_id)`.
- Upload via client (`supabase.storage`) com path `${org_id}/${document_id}/${filename}`.
- Download via URL assinada gerada por server function (60 s de validade).

### Server functions (`createServerFn`)
- `createDocumentDraft({ name, mime_type, size_bytes, document_type_id?, tags? })` — cria linha em `documents` com status `pending`, retorna `{ id, storage_path }`. Validação Zod (tamanho, mime).
- `finalizeDocumentUpload({ id })` — confirma upload, marca `status = processed` (stub: sem OCR; quando OCR chegar, passará por `processing`).
- `listDocuments({ status?, type_id?, tag?, q?, cursor? })` — lista paginada com filtros, scoped à org ativa.
- `getDocumentSignedUrl({ id })` — gera URL assinada do storage.
- `updateDocumentMetadata({ id, name?, document_type_id?, tags? })`.
- `softDeleteDocument({ id })` — restrito a `org_admin`.
- Todas com `requireSupabaseAuth` + verificação de membership na org alvo.

### Componentes
- `FileDropzone` (react-dropzone) com preview, validação e progresso.
- `UploadQueueItem` — card por arquivo em envio.
- `DocumentTable` — tabela com colunas: nome, tipo, tags, uploader, status, data, ações.
- `DocumentViewer` — render de PDF (via `<iframe>` da URL assinada) e imagem.
- `StatusBadge` — pill colorido por status.
- `TagInput` — input com chips para tags livres.

### Realtime
- Subscription em `documents` filtrada por `org_id` para refletir mudanças de status na fila e GED automaticamente. Cleanup no unmount.

### Rotas afetadas
- Substituir stubs em `/_authenticated/upload`, `/queue`, `/documents` pelo conteúdo real.
- Nova rota `/_authenticated/documents/$id`.
- Menu da sidebar mantém ordem e ícones atuais.

### Validações e limites
- Cliente: max 25 MB por arquivo, max 20 arquivos por lote, mimes permitidos.
- Servidor: mesma validação Zod nas server functions.
- Erros amigáveis via `sonner` (toast).

## Confirmação

Posso prosseguir com Upload + Fila + GED básica conforme acima?
