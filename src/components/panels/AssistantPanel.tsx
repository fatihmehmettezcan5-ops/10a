"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AssistantItem, type Me } from "@/lib/client";

type ProviderInfo = { label: string; model: string; id: string };

const SUGGESTIONS = [
  "Bugün ne var?",
  "Ödev ekle: Matematik 142. sayfa 1-12, teslim cuma",
  "Matematik ödevi bitti",
  "Fizik ödevini pazartesiye ertele",
  "Yarın 15:00 kütüphane buluşmasını sınıfa hatırlat",
  "Bu hafta hangi ödevler gecikmiş?",
];

export default function AssistantPanel({
  me,
  onChanged,
  notify,
}: {
  me: Me;
  onChanged: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const [messages, setMessages] = useState<AssistantItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ messages: AssistantItem[]; provider: ProviderInfo }>("/api/assistant");
      setMessages(data.messages);
      setProvider(data.provider);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Asistan geçmişi yüklenemedi.");
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "user", content: question, createdAt: new Date().toISOString() },
    ]);
    setLoading(true);
    try {
      const data = await api<{ reply: string; changed: boolean; provider: ProviderInfo }>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({ message: question }),
      });
      setProvider(data.provider);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: data.reply, createdAt: new Date().toISOString() },
      ]);
      if (data.changed) {
        await onChanged();
        notify("Asistan uygulamada değişiklik yaptı ✨");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Asistan yanıt veremedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="card flex h-[72vh] flex-col p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h1 className="text-lg font-bold text-white">🤖 Ödev Asistanı</h1>
            <p className="text-xs text-slate-400">
              Ödevleri, takvimi, ders programını bilir; istersen senin adına değiştirir.
            </p>
          </div>
          {provider && (
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                provider.id === "local"
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {provider.label} · {provider.model}
            </span>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
              Selam {me.name.split(" ")[0]}! Ödevleri, sınavları ve programı sorabilir; “ödev ekle”, “bitti
              yap”, “ertele”, “hatırlat” gibi komutlarla uygulamayı değiştirebilirsin.
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm ${
                  message.role === "user"
                    ? "rounded-tr-sm bg-gradient-to-br from-indigo-500 to-violet-600 text-white"
                    : "rounded-tl-sm border border-slate-700/70 bg-slate-800/70 text-slate-100"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-sm border border-slate-700/70 bg-slate-800/70 px-3.5 py-2.5 text-sm text-slate-400">
                düşünüyor<span className="animate-pulse">...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="mt-3 flex gap-2 border-t border-slate-800 pt-3"
        >
          <input
            className="input flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Asistana sor ya da komut ver..."
            disabled={loading}
          />
          <button className="btn btn-primary" disabled={loading || !input.trim()}>
            Gönder
          </button>
        </form>
      </div>

      <aside className="space-y-4">
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-bold text-white">⚡ Hızlı komutlar</h2>
          <div className="space-y-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => void ask(suggestion)}
                disabled={loading}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-indigo-500/50 hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </section>

        <section className="card p-4 text-xs leading-relaxed text-slate-400">
          <h2 className="mb-2 text-sm font-bold text-white">🔑 Model ayarı</h2>
          <p>
            Anahtar yoksa asistan <b>yerleşik kural motoruyla</b> çalışır (tamamen ücretsiz, komutları anlar).
            Daha doğal sohbet için sunucuya şu ortam değişkenlerinden birini ekle:
          </p>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-slate-300">
            <li>OPENROUTER_API_KEY</li>
            <li>GEMINI_API_KEY</li>
            <li>GROQ_API_KEY</li>
          </ul>
          <p className="mt-2">
            İstersen modeli <span className="font-mono">OPENROUTER_MODEL</span> /{" "}
            <span className="font-mono">GEMINI_MODEL</span> ile değiştirebilirsin.
          </p>
        </section>
      </aside>
    </div>
  );
}
