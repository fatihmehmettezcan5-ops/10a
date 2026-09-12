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

export function detectProvider(): ProviderInfo {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      id: "openrouter",
      label: "OpenRouter",
      model: process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-chat-v3-0324:free",
    };
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return {
      id: "gemini",
      label: "Google Gemini",
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      id: "groq",
      label: "Groq",
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    };
  }
  return { id: "local", label: "Yerleşik Asistan (anahtarsız mod)", model: "kural-motoru" };
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

async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  turns: ChatTurn[],
  extraHeaders: Record<string, string> = {},
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
      max_tokens: 1200,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
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
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

export async function runModel(turns: ChatTurn[]): Promise<{ raw: string; provider: ProviderInfo }> {
  const provider = detectProvider();

  if (provider.id === "openrouter") {
    const raw = await callOpenAiCompatible(
      "https://openrouter.ai/api/v1",
      process.env.OPENROUTER_API_KEY!,
      provider.model,
      turns,
      {
        "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
        "X-Title": "Sinif Asistani",
      },
    );
    return { raw, provider };
  }

  if (provider.id === "gemini") {
    const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY!;
    return { raw: await callGemini(key, provider.model, turns), provider };
  }

  if (provider.id === "groq") {
    const raw = await callOpenAiCompatible(
      "https://api.groq.com/openai/v1",
      process.env.GROQ_API_KEY!,
      provider.model,
      turns,
    );
    return { raw, provider };
  }

  return { raw: "", provider };
}
