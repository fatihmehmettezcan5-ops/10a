export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

export type AiResult = {
  reply: string;
  actions: Record<string, unknown>[];
  provider: string;
  error?: string;
};

export type ProviderInfo = {
  id: "openrouter" | "gemini" | "groq" | "local";
  label: string;
  model: string;
};

type RemoteProviderId = Exclude<ProviderInfo["id"], "local">;

/**
 * Eylül 2026 resmi kataloglarına göre güncel, yapılandırılmış JSON destekli model zincirleri.
 * İlk model varsayılandır; servis/model geçici olarak kullanılamazsa sıradaki denenir.
 */
const DEFAULT_MODEL_CHAINS: Record<RemoteProviderId, readonly string[]> = {
  gemini: ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.1-flash-lite"],
  groq: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
  openrouter: [
    "nex-agi/nex-n2.5-pro:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "openrouter/free",
  ],
};

const PROVIDER_LABELS: Record<RemoteProviderId, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
};

const MODEL_ENV_NAMES: Record<RemoteProviderId, string> = {
  gemini: "GEMINI_MODEL",
  groq: "GROQ_MODEL",
  openrouter: "OPENROUTER_MODEL",
};

function hasProviderKey(id: RemoteProviderId): boolean {
  if (id === "gemini") return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (id === "groq") return Boolean(process.env.GROQ_API_KEY);
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function configuredModel(id: RemoteProviderId): string | undefined {
  return process.env[MODEL_ENV_NAMES[id]]?.trim() || undefined;
}

function modelChain(id: RemoteProviderId): string[] {
  const custom = configuredModel(id);
  return [...new Set([...(custom ? [custom] : []), ...DEFAULT_MODEL_CHAINS[id]])];
}

/**
 * Birden fazla anahtar varsa varsayılan öncelik Gemini → Groq → OpenRouter'dır.
 * AI_PROVIDER=gemini|groq|openrouter ile öncelik değiştirilebilir.
 */
function providerOrder(): RemoteProviderId[] {
  const supported: RemoteProviderId[] = ["gemini", "groq", "openrouter"];
  const preferred = process.env.AI_PROVIDER?.trim().toLowerCase() as RemoteProviderId | undefined;
  if (preferred && supported.includes(preferred)) {
    return [preferred, ...supported.filter((id) => id !== preferred)];
  }
  return supported;
}

export function detectProvider(): ProviderInfo {
  const id = providerOrder().find(hasProviderKey);
  if (!id) return { id: "local", label: "Yerleşik Asistan (anahtarsız mod)", model: "kural-motoru" };
  return { id, label: PROVIDER_LABELS[id], model: modelChain(id)[0] };
}

/** Modelin döndürdüğü metinden ilk geçerli JSON nesnesini çıkarır. */
export function extractJson(raw: string): { reply: string; actions: Record<string, unknown>[] } | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/```json/gi, "```")
    .split("```")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidates = [raw, ...cleaned];

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
        reply?: unknown;
        actions?: unknown;
      };
      if (typeof parsed.reply === "string") {
        return {
          reply: parsed.reply,
          actions: Array.isArray(parsed.actions)
            ? (parsed.actions.filter((a) => a && typeof a === "object") as Record<string, unknown>[])
            : [],
        };
      }
    } catch {
      // sonraki adaya geç
    }
  }
  return null;
}

class ProviderRequestError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`${status}: ${detail.slice(0, 300)}`);
    this.status = status;
  }
}

async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  turns: ChatTurn[],
  extraHeaders: Record<string, string> = {},
  extraBody: Record<string, unknown> = {},
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: turns,
      temperature: 0.3,
      max_tokens: 1600,
      response_format: { type: "json_object" },
      ...extraBody,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    throw new ProviderRequestError(response.status, await response.text());
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("Model boş yanıt döndürdü.");
  return content;
}

async function callGemini(apiKey: string, model: string, turns: ChatTurn[]): Promise<string> {
  const system = turns.filter((t) => t.role === "system").map((t) => t.content).join("\n\n");
  const contents = turns
    .filter((t) => t.role !== "system")
    .map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1600,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );

  if (!response.ok) {
    throw new ProviderRequestError(response.status, await response.text());
  }
  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!content.trim()) throw new Error("Model boş yanıt döndürdü.");
  return content;
}

async function callProvider(id: RemoteProviderId, model: string, turns: ChatTurn[]): Promise<string> {
  if (id === "gemini") {
    const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY!;
    return callGemini(key, model, turns);
  }

  if (id === "groq") {
    return callOpenAiCompatible(
      "https://api.groq.com/openai/v1",
      process.env.GROQ_API_KEY!,
      model,
      turns,
      {},
      // Groq reasoning modelleri JSON modunda düşünce metnini içerikten ayırmalı.
      { reasoning_format: "hidden" },
    );
  }

  return callOpenAiCompatible(
    "https://openrouter.ai/api/v1",
    process.env.OPENROUTER_API_KEY!,
    model,
    turns,
    {
      "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
      "X-Title": "Sinif Asistani",
    },
  );
}

/**
 * Önce seçilen sağlayıcının en iyi üç modelini, gerekirse diğer anahtarı bulunan
 * sağlayıcıları dener. 401/403 anahtar hatalarında aynı sağlayıcının diğer modellerini
 * boşuna denemez. Tümü başarısızsa üst katman yerleşik asistana geçer.
 */
export async function runModel(turns: ChatTurn[]): Promise<{ raw: string; provider: ProviderInfo }> {
  const available = providerOrder().filter(hasProviderKey);
  if (available.length === 0) return { raw: "", provider: detectProvider() };

  const failures: string[] = [];
  for (const id of available) {
    for (const model of modelChain(id)) {
      try {
        const raw = await callProvider(id, model, turns);
        return { raw, provider: { id, label: PROVIDER_LABELS[id], model } };
      } catch (error) {
        failures.push(`${PROVIDER_LABELS[id]} / ${model}: ${error instanceof Error ? error.message : "hata"}`);
        if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) break;
      }
    }
  }

  throw new Error(`Tüm yapay zekâ modelleri başarısız oldu: ${failures.join(" | ")}`);
}
