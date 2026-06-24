import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface FieldDef {
  label: string;
  field_key: string;
  field_type: string;
  options?: unknown;
}

const MODEL = "claude-haiku-4-5-20251001";

/**
 * Extrai valores de indexação da PRIMEIRA PÁGINA de um documento (PDF/imagem)
 * via API da Anthropic (Claude Haiku 4.5) e grava log de auditoria em
 * `ai_usage_logs` (empresa, tipo de documento, arquivo, tokens).
 *
 * FormData:
 *  - file: File
 *  - fields: JSON string com FieldDef[]
 *  - companyId?: string
 *  - documentTypeId?: string
 */
export const extractFieldsWithClaude = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error("FormData é obrigatório");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurado no servidor");

    const file = data.get("file");
    const fieldsJson = String(data.get("fields") ?? "[]");
    const companyId = (data.get("companyId") as string) || null;
    const documentTypeId = (data.get("documentTypeId") as string) || null;

    if (!(file instanceof File)) throw new Error("Arquivo ausente ou inválido");
    const uploadFile: File = file;

    let fields: FieldDef[] = [];
    try {
      fields = JSON.parse(fieldsJson);
    } catch {
      throw new Error("fields inválido (JSON malformado)");
    }
    if (!Array.isArray(fields) || fields.length === 0) {
      return { values: {} as Record<string, string>, usage: null };
    }

    const { supabase, userId } = context;

    const [{ data: profile }, companyRes, typeRes] = await Promise.all([
      supabase.from("profiles").select("current_org_id").eq("id", userId).maybeSingle(),
      companyId
        ? supabase.from("companies").select("name").eq("id", companyId).maybeSingle()
        : Promise.resolve({ data: null }),
      documentTypeId
        ? supabase
            .from("document_types")
            .select("name")
            .eq("id", documentTypeId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const orgId = profile?.current_org_id ?? null;
    const companyName = (companyRes?.data as { name?: string } | null)?.name ?? null;
    const documentTypeName =
      (typeRes?.data as { name?: string } | null)?.name ?? null;

    async function writeFailureLog(args: {
      prompt: number;
      completion: number;
      total: number;
      error?: string;
    }) {
      if (!orgId) return;
      await supabase.from("ai_usage_logs").insert({
        org_id: orgId,
        user_id: userId,
        company_id: companyId,
        company_name: companyName,
        document_type_id: documentTypeId,
        document_type_name: documentTypeName,
        file_name: uploadFile.name,
        model: MODEL,
        prompt_tokens: args.prompt,
        completion_tokens: args.completion,
        total_tokens: args.total,
        success: false,
        error_message: args.error ?? null,
      });
    }

    const mimeType = uploadFile.type || "application/octet-stream";
    // Claude aceita: image/jpeg, image/png, image/gif, image/webp e application/pdf
    const isImage = /^image\/(jpeg|png|gif|webp)$/.test(mimeType);
    const isPdf = mimeType === "application/pdf";
    if (!isImage && !isPdf) {
      await writeFailureLog({
        prompt: 0,
        completion: 0,
        total: 0,
        error: `Tipo de arquivo não suportado pelo Claude: ${mimeType}`,
      });
      throw new Error(
        "Claude aceita apenas PDF, JPG, PNG, GIF ou WEBP. Converta antes de enviar.",
      );
    }

    const buf = await uploadFile.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");

    const schemaDesc = fields
      .map((f) => {
        const isMatricula = f.field_key.toLowerCase().includes("matricula");
        let desc = `- "${f.field_key}" — rótulo: "${f.label}", tipo: ${f.field_type}`;
        if (isMatricula) {
          desc += `, APENAS NÚMEROS (remova letras, pontos, traços, barras e espaços)`;
        }
        if (f.field_type === "select" && Array.isArray(f.options)) {
          desc += `, opções permitidas: ${(f.options as string[]).join(" | ")}`;
        }
        return desc;
      })
      .join("\n");

    const prompt = `Você é um extrator de dados de documentos digitalizados.
Analise SOMENTE A PRIMEIRA PÁGINA do documento anexado e extraia os campos de indexação abaixo.

Campos:
${schemaDesc}

Regras de saída (siga RIGOROSAMENTE):
- Retorne EXCLUSIVAMENTE um objeto JSON válido, sem markdown, sem comentários, sem texto extra.
- Use exatamente as chaves listadas (field_key).
- Campos do tipo "date": formato brasileiro "DD/MM/AAAA" (dia/mês/ano com 2/2/4 dígitos, separados por barra).
- Campos do tipo "number": apenas o número, sem símbolos de moeda nem separador de milhar; use ponto como decimal.
- Campos cujo field_key contenha "matricula": retorne APENAS os dígitos numéricos, removendo letras, pontos, traços, barras e espaços.
- Campos do tipo "select": retorne EXATAMENTE um dos valores listados em "opções permitidas".
- Demais campos (text/textarea): retorne em LETRAS MAIÚSCULAS, sem acentos extras.
- Se a informação não for encontrada com confiança, retorne string vazia "".`;

    const sourceBlock = isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mimeType, data: base64 },
        };

    const requestBody = JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [sourceBlock, { type: "text", text: prompt }],
        },
      ],
    });

    const MAX_ATTEMPTS = 3;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const startedAt = Date.now();
    let resp: Response | null = null;
    let lastErrText = "";
    let lastStatus = 0;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: requestBody,
        });
        if (r.ok) {
          resp = r;
          break;
        }
        lastStatus = r.status;
        lastErrText = await r.text();
        const retriable = r.status === 529 || r.status === 429 || r.status >= 500;
        if (!retriable) {
          resp = r;
          break;
        }
        await sleep(1000 * Math.pow(2, attempt));
      } catch (e: any) {
        lastErrText = `network: ${e?.message ?? "fetch failed"}`;
        lastStatus = 0;
        await sleep(1000 * Math.pow(2, attempt));
      }
    }

    if (!resp || !resp.ok) {
      await writeFailureLog({
        prompt: 0,
        completion: 0,
        total: 0,
        error: `Claude ${lastStatus || "network"}: ${lastErrText.slice(0, 200)}`,
      });
      const friendly =
        lastStatus === 529
          ? "O serviço de IA (Claude) está temporariamente sobrecarregado. Tente novamente em alguns instantes."
          : lastStatus === 429
            ? "Limite de requisições atingido (Claude). Aguarde alguns segundos e tente novamente."
            : `Falha ao processar o documento via Claude (${lastStatus || "rede"}). Tente novamente.`;
      throw new Error(friendly);
    }

    const json = (await resp.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const promptTokens = json.usage?.input_tokens ?? 0;
    const completionTokens = json.usage?.output_tokens ?? 0;
    const totalTokens = promptTokens + completionTokens;

    const text =
      json.content?.find((c) => c.type === "text")?.text?.trim() ?? "{}";
    // Claude pode embrulhar em ```json ... ``` mesmo pedindo o contrário
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let extracted: Record<string, unknown> = {};
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      extracted = {};
    }

    const result: Record<string, string> = {};
    for (const f of fields) {
      const v = extracted[f.field_key];
      if (v == null) continue;
      const s = String(v).trim();
      if (!s) continue;
      const isMatricula = f.field_key.toLowerCase().includes("matricula");
      if (isMatricula) {
        result[f.field_key] = s.replace(/\D/g, "");
      } else if (f.field_type === "date") {
        const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const brMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
        if (isoMatch) {
          result[f.field_key] = `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
        } else if (brMatch) {
          const d = brMatch[1].padStart(2, "0");
          const m = brMatch[2].padStart(2, "0");
          const y = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3];
          result[f.field_key] = `${d}/${m}/${y}`;
        } else {
          result[f.field_key] = s;
        }
      } else if (f.field_type === "number") {
        result[f.field_key] = s;
      } else {
        result[f.field_key] = s.toUpperCase();
      }
    }

    return {
      values: result,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        model: MODEL,
        duration_ms: Date.now() - startedAt,
      },
    };
  });
