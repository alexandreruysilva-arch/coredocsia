import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface FieldDef {
  label: string;
  field_key: string;
  field_type: string;
  options?: unknown;
}

/**
 * Extrai valores de indexação da PRIMEIRA PÁGINA de um documento (PDF/imagem)
 * usando a API do Google Gemini (modelo gemini-2.5-flash-lite).
 *
 * Recebe FormData com:
 *  - file: File (PDF/imagem)
 *  - fields: JSON string com array de FieldDef
 *
 * Retorna { values: Record<field_key, string> } com texto em MAIÚSCULAS
 * (exceto campos number/date).
 */
export const extractFieldsWithGemini = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error("FormData é obrigatório");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurado no servidor");
    }

    const file = data.get("file");
    const fieldsJson = String(data.get("fields") ?? "[]");

    if (!(file instanceof File)) {
      throw new Error("Arquivo ausente ou inválido");
    }

    let fields: FieldDef[] = [];
    try {
      fields = JSON.parse(fieldsJson);
    } catch {
      throw new Error("fields inválido (JSON malformado)");
    }
    if (!Array.isArray(fields) || fields.length === 0) {
      return { values: {} as Record<string, string> };
    }

    const buf = await file.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const mimeType = file.type || "application/octet-stream";

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
- Campos do tipo "date": formato ISO "YYYY-MM-DD".
- Campos do tipo "number": apenas o número, sem símbolos de moeda nem separador de milhar; use ponto como decimal.
- Campos cujo field_key contenha "matricula": retorne APENAS os dígitos numéricos, removendo letras, pontos, traços, barras e espaços.
- Campos do tipo "select": retorne EXATAMENTE um dos valores listados em "opções permitidas".
- Demais campos (text/textarea): retorne em LETRAS MAIÚSCULAS, sem acentos extras.
- Se a informação não for encontrada com confiança, retorne string vazia "".`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(
        `Gemini API erro ${resp.status}: ${errText.slice(0, 400)}`,
      );
    }

    const json = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
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
      if (f.field_type === "number" || f.field_type === "date") {
        result[f.field_key] = s;
      } else {
        result[f.field_key] = s.toUpperCase();
      }
    }

    return { values: result };
  });
