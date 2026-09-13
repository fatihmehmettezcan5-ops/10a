"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AssistantItem, type Me } from "@/lib/client";

type ProviderInfo = { label: string; model: string; id: string };
type StagedFile = { file: File; previewUrl: string | null };

const MAX_FILES = 2;
const MAX_FILE_MB = 3.5;
const MAX_TOTAL_MB = 4;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

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
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const next = [...staged];
    let error = "";
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        error = `Bir mesaja en fazla ${MAX_FILES} dosya ekleyebilirsin.`;
        break;
      }
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
      if (!isImage && file.type !== "application/pdf") {
        error = `"${file.name}" eklenemedi: sadece fotoğraf (PNG/JPG/WebP) veya PDF.`;
        continue;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        error = `"${file.name}" çok büyük (en fazla ${MAX_FILE_MB} MB).`;
        continue;
      }
      const total = next.reduce((sum, s) => sum + s.file.size, 0) + file.size;
      if (total > MAX_TOTAL_MB * 1024 * 1024) {
        error = "Ek dosyaların toplam boyutu 4 MB'yi aşamaz.";
        continue;
      }
      next.push({ file, previewUrl: isImage ? URL.createObjectURL(file) : null });
    }
    if (error) notify(error);
    setStaged(next);
  }

  function removeStaged(index: number) {
    const item = staged[index];
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setStaged(staged.filter((_, i) => i !== index));
  }

  function clearStaged() {
    staged.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
    setStaged([]);
  }

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
    if ((!question && staged.length === 0) || loading) return;
    setInput("");
    const attachmentCount = staged.length;
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: "user",
        content: attachmentCount ? `${question} 📎×${attachmentCount}` : question,
        createdAt: new Date().toISOString(),
      },
    ]);
    setLoading(true);
    try {
      let data: { reply: string; changed: boolean; provider: ProviderInfo };
      if (staged.length) {
        const form = new FormData();
        form.append("message", question);
        staged.forEach((s) => form.append("files", s.file));
        data = await api<{ reply: string; changed: boolean; provider: ProviderInfo }>("/api/assistant", {
          method: "POST",
          body: form,
        });
      } else {
        data = await api<{ reply: string; changed: boolean; provider: ProviderInfo }>("/api/assistant", {
          method: "POST",
          body: JSON.stringify({ message: question }),
        });
      }
      setProvider(data.provider);
      clearStaged();
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

        {staged.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {staged.map((item, index) => (
              <span
                key={`${item.file.name}-${index}`}
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-200"
              >
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <span aria-hidden>📄</span>
                )}
                <span className="max-w-36 truncate">{item.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeStaged(index)}
                  className="text-slate-500 transition hover:text-rose-300"
                  aria-label="Eki kaldır"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="mt-3 flex gap-2 border-t border-slate-800 pt-3"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn-ghost px-3"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || staged.length >= MAX_FILES}
            title="Fotoğraf veya PDF ekle"
          >
            📎
          </button>
          <input
            className="input flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Asistana sor ya da komut ver... (📎 ile fotoğraf/PDF)"
            disabled={loading}
          />
          <button className="btn btn-primary" disabled={loading || (!input.trim() && staged.length === 0)}>
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
            Anahtar yoksa asistan <b>yerleşik kural motoruyla</b> çalışır. Güncel varsayılanlar:
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
            <li><b>Gemini:</b> 3.8 Flash</li>
            <li><b>Groq:</b> GPT-OSS 120B</li>
            <li><b>OpenRouter:</b> Nex-N2.5-Pro Free</li>
          </ul>
          <p className="mt-2">
            Model env&apos;leri opsiyoneldir. <span className="font-mono">AI_PROVIDER</span> ilk tercihi belirler;
            hata/kotada diğer güncel modellere otomatik geçilir.
          </p>
        </section>
      </aside>
    </div>
  );
}
