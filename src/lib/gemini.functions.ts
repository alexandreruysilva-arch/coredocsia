import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface FieldDef {
  label: string;
  field_key: string;
  field_type: string;
  options?: unknown;
}

const MODEL = "gemini-2.5-flash-lite";

/**
 * Extrai valores de indexação da PRIMEIRA PÁGINA de um documento (PDF/imagem)
 * via Google Gemini (gemini-2.5-flash-lite) e grava log de auditoria de uso
 * de tokens em `ai_usage_logs` (empresa, tipo de documento, arquivo, tokens).
 *
 * FormData:
 *  - file: File
 *  - fields: JSON string com FieldDef[]
 *  - companyId?: string
 *  - documentTypeId?: string
 */
export const extractFieldsWithGemini = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error("FormData é obrigatório");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurado no servidor");

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

    // Carrega org do usuário + nomes da empresa e tipo de documento p/ log
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

    const logContext = {
      orgId,
      userId,
      companyId,
      companyName,
      documentTypeId,
      documentTypeName,
      fileName: uploadFile.name,
    };

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

    const buf = await uploadFile.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const mimeType = uploadFile.type || "application/octet-stream";

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

    const requestBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
      },
    });

    // Tenta o modelo principal e, em caso de sobrecarga (503/429/5xx),
    // faz retries com backoff e por fim tenta um modelo de fallback.
    const MODELS_TO_TRY = [MODEL, "gemini-2.5-flash", "gemini-1.5-flash"];
    const MAX_ATTEMPTS_PER_MODEL = 3;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const startedAt = Date.now();
    let resp: Response | null = null;
    let lastErrText = "";
    let lastStatus = 0;

    outer: for (const modelName of MODELS_TO_TRY) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
          });
          if (r.ok) {
            resp = r;
            break outer;
          }
          lastStatus = r.status;
          lastErrText = await r.text();
          const retriable = r.status === 503 || r.status === 429 || r.status >= 500;
          if (!retriable) {
            resp = r;
            // recoloca corpo lido — abaixo usamos lastErrText
            break outer;
          }
          // Backoff exponencial: 1s, 2s, 4s
          await sleep(1000 * Math.pow(2, attempt));
        } catch (e: any) {
          lastErrText = `network: ${e?.message ?? "fetch failed"}`;
          lastStatus = 0;
          await sleep(1000 * Math.pow(2, attempt));
        }
      }
    }

    if (!resp || !resp.ok) {
      await writeFailureLog({
        prompt: 0,
        completion: 0,
        total: 0,
        error: `Gemini ${lastStatus || "network"}: ${lastErrText.slice(0, 200)}`,
      });
      const friendly =
        lastStatus === 503
          ? "O serviço de IA está temporariamente sobrecarregado. Tente novamente em alguns instantes."
          : lastStatus === 429
            ? "Limite de requisições atingido. Aguarde alguns segundos e tente novamente."
            : `Falha ao processar o documento (${lastStatus || "rede"}). Tente novamente.`;
      throw new Error(friendly);
    }


    const json = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const promptTokens = json.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
    const totalTokens =
      json.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens;

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    let extracted: Record<string, unknown> = {};
    try {
      extracted = JSON.parse(text);
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
        // Normaliza para DD/MM/AAAA (formato brasileiro)
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
      logContext,
    };
  });
