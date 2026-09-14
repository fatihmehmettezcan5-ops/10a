"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type AiMemoryItem,
  type AssistantArtifact,
  type AssistantItem,
  type AssistantProject,
  type Me,
} from "@/lib/client";
import { BUBBLE_IN, BUBBLE_OUT, CHAT_BG_STYLE, dayKey, dayLabel, timeLabel } from "@/lib/chat-ui";

type ProviderInfo = { label: string; model: string; id: string };
type StagedFile = { file: File; previewUrl: string | null };

const MAX_FILES = 2;
const MAX_FILE_MB = 3.5;
const MAX_TOTAL_MB = 4;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const SUGGESTIONS = [
  "Bugün ne var?",
  "Ödev ekle: Matematik 142. sayfa 1-12, teslim cuma",
  "Bu hafta hangi ödevler gecikmiş?",
  "TYT netlerimi yükseltmek için çalışma programı öner",
  "Bana mor uzay temalı bir afiş üret",
  "Bir HTML sayaç sayfası yap (geri sayım)",
];

function SendIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function escapeScript(code: string): string {
  return code.replace(/<\/script>/gi, "<\\/script>");
}

function jsRunnerHtml(code: string): string {
  return `<script>
const send = (t, x) => parent.postMessage({ __runner: true, type: t, text: x }, "*");
const fmt = (...a) => a.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" ");
console.log = console.info = console.warn = (...a) => send("out", fmt(...a));
console.error = (...a) => send("err", fmt(...a));
const CODE = ${JSON.stringify(code)};
(async () => {
  try {
    const fn = new Function("console", "return (async () => {" + CODE + "\\n})()");
    const r = await fn(console);
    if (r !== undefined) send("out", String(r));
    send("done", "");
  } catch (e) {
    send("err", String(e));
    send("done", "");
  }
})();
<\/script>`;
}

function pyRunnerHtml(code: string): string {
  return `<script src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"><\/script>
<script>
const send = (t, x) => parent.postMessage({ __runner: true, type: t, text: x }, "*");
const CODE = ${JSON.stringify(code)};
(async () => {
  try {
    send("status", "Python yükleniyor (ilk çalıştırmada ~10 sn)...");
    const py = await loadPyodide({
      stdout: (s) => send("out", s),
      stderr: (s) => send("err", s),
    });
    send("status", "");
    const r = await py.runPythonAsync(CODE);
    if (r !== undefined && r !== null) send("out", String(r));
    send("done", "");
  } catch (e) {
    send("err", String(e));
    send("done", "");
  }
})();
<\/script>`;
}

/** Kodu sandbox iframe içinde çalıştırır (JS anında, Python Pyodide CDN ile). */
function CodeRunner({ code, language }: { code: string; language: string }) {
  const lang = language.toLowerCase().startsWith("py") ? "python" : "js";
  const [lines, setLines] = useState<{ kind: "out" | "err" | "status"; text: string }[]>([]);
  const [done, setDone] = useState(false);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data as { __runner?: boolean; type?: string; text?: string };
      if (!d || !d.__runner) return;
      if (d.type === "done") {
        setDone(true);
        return;
      }
      setLines((prev) => {
        const next = [
          ...prev,
          {
            kind: (d.type === "err" ? "err" : d.type === "status" ? "status" : "out") as "out" | "err" | "status",
            text: String(d.text ?? ""),
          },
        ];
        return next.slice(-60);
      });
    }
    window.addEventListener("message", onMessage);
    const timer = window.setTimeout(() => setDone(true), 45000);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
  }, [runKey]);

  const html = lang === "python" ? pyRunnerHtml(code) : jsRunnerHtml(code);

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-[#0b141a] p-2 font-mono text-xs shadow-inner">
      <div className="max-h-44 space-y-0.5 overflow-y-auto">
        {lines.length === 0 && !done && <p className="text-slate-500">çalışıyor...</p>}
        {lines.map((line, i) => (
          <p
            key={i}
            className={line.kind === "err" ? "text-rose-300" : line.kind === "status" ? "text-amber-300" : "text-slate-200"}
          >
            {line.text}
          </p>
        ))}
        {done && <p className="mt-1 text-emerald-400">— bitti —</p>}
      </div>
      {done && (
        <button
          type="button"
          onClick={() => {
            setLines([]);
            setDone(false);
            setRunKey((k) => k + 1);
          }}
          className="mt-1 rounded bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"
        >
          ↻ tekrar çalıştır
        </button>
      )}
      <iframe key={runKey} title="kod-çalıştırıcı" className="hidden" sandbox="allow-scripts" srcDoc={html} />
    </div>
  );
}

const LANG_LABELS: Record<string, string> = {
  html: "HTML",
  svg: "SVG",
  javascript: "JS",
  js: "JS",
  typescript: "TS",
  python: "Python",
  py: "Python",
};

function ArtifactCard({ artifact }: { artifact: AssistantArtifact }) {
  const lang = artifact.language.toLowerCase();
  const runnable = ["js", "javascript", "py", "python"].includes(lang);
  const previewable = ["html", "svg"].includes(lang);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"none" | "run" | "preview">("none");

  function download() {
    const ext =
      lang.startsWith("py") ? "py" : lang === "javascript" || lang === "js" ? "js" : lang === "svg" ? "svg" : lang === "html" ? "html" : "txt";
    const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${artifact.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "artifact"}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mt-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-300">
          {LANG_LABELS[lang] ?? artifact.language.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100">{artifact.title}</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] text-slate-400 hover:text-white">
          {open ? "gizle" : "göster"}
        </button>
        {previewable && (
          <button
            type="button"
            onClick={() => setMode(mode === "preview" ? "none" : "preview")}
            className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-white/20 hover:text-white"
          >
            👁 önizleme
          </button>
        )}
        {runnable && (
          <button
            type="button"
            onClick={() => setMode(mode === "run" ? "none" : "run")}
            className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/30"
          >
            ▶ çalıştır
          </button>
        )}
        <button
          type="button"
          onClick={download}
          className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-white/20 hover:text-white"
        >
          ⬇ indir
        </button>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(artifact.content)}
          className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-white/20 hover:text-white"
        >
          📋 kopyala
        </button>
      </div>
      {open && (
        <pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-[#0b141a] p-2 font-mono text-[11px] leading-relaxed text-slate-200">
          {artifact.content}
        </pre>
      )}
      {mode === "preview" && (
        <iframe
          title="artifact-önizleme"
          className="mt-2 h-64 w-full rounded-lg border border-white/10 bg-white"
          sandbox="allow-scripts"
          srcDoc={artifact.content}
        />
      )}
      {mode === "run" && <CodeRunner code={artifact.content} language={lang} />}
    </div>
  );
}

function metaOf(message: AssistantItem, type: string): { items?: unknown } | null {
  const action = message.actions?.find((a) => a.type === type);
  return action ? (action as unknown as { items?: unknown }) : null;
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-lg bg-[#182229] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 shadow">
        {dayLabel(iso)}
      </span>
    </div>
  );
}

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
  const [research, setResearch] = useState(false);
  const [projects, setProjects] = useState<AssistantProject[]>([]);
  const [activeProject, setActiveProject] = useState<number | null>(null);
  const [memories, setMemories] = useState<AiMemoryItem[]>([]);
  const [newProject, setNewProject] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const loadSide = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([
        api<{ projects: AssistantProject[] }>("/api/assistant/projects"),
        api<{ memories: AiMemoryItem[] }>("/api/assistant/memory"),
      ]);
      setProjects(p.projects);
      setMemories(m.memories);
    } catch {
      /* sessiz */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api<{ messages: AssistantItem[]; provider: ProviderInfo }>(
        `/api/assistant?project=${activeProject ?? 0}`,
      );
      setMessages(data.messages);
      setProvider(data.provider);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Asistan geçmişi yüklenemedi.");
    }
  }, [notify, activeProject]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadSide();
  }, [loadSide]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  function growTextarea(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }

  async function ask(text: string) {
    const question = text.trim();
    if ((!question && staged.length === 0) || loading) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    const attachmentCount = staged.length;
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: "user",
        content: attachmentCount ? `${question} 📎×${attachmentCount}` : question,
        actions: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    setLoading(true);
    try {
      let data: {
        reply: string;
        changed: boolean;
        provider: ProviderInfo;
        followups?: string[];
        artifacts?: AssistantArtifact[];
        actions?: { type: string; ok?: boolean; summary?: string; url?: string }[];
      };
      if (staged.length) {
        const form = new FormData();
        form.append("message", question);
        staged.forEach((s) => form.append("files", s.file));
        data = await api("/api/assistant", { method: "POST", body: form });
      } else {
        data = await api("/api/assistant", {
          method: "POST",
          body: JSON.stringify({ message: question, research, projectId: activeProject }),
        });
      }
      setProvider(data.provider);
      clearStaged();
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: data.reply,
          actions: [
            ...(data.actions ?? []),
            ...(data.followups?.length ? [{ type: "_meta_followups", items: data.followups }] : []),
            ...(data.artifacts?.length ? [{ type: "_meta_artifacts", items: data.artifacts }] : []),
          ],
          createdAt: new Date().toISOString(),
        },
      ]);
      if (data.changed) {
        await onChanged();
        notify("Asistan uygulamada değişiklik yaptı ✨");
      }
      void loadSide();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Asistan yanıt veremedi.");
    } finally {
      setLoading(false);
    }
  }

  async function createProjectDo() {
    const name = newProject.trim();
    if (!name) return;
    try {
      const data = await api<{ project: AssistantProject }>("/api/assistant/projects", {
        method: "POST",
        body: JSON.stringify({ name, note: `${me.name} projesi` }),
      });
      setNewProject("");
      await loadSide();
      setActiveProject(data.project.id);
      await load();
      notify(`📁 "${data.project.name}" projesi oluşturuldu`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Proje oluşturulamadı.");
    }
  }

  async function deleteProjectDo(id: number) {
    try {
      await api(`/api/assistant/projects?id=${id}`, { method: "DELETE" });
      if (activeProject === id) setActiveProject(null);
      await loadSide();
      await load();
    } catch {
      notify("Proje silinemedi.");
    }
  }

  async function deleteMemoryDo(id: number) {
    try {
      await api(`/api/assistant/memory?id=${id}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      notify("Hafıza silinemedi.");
    }
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="card flex h-[76vh] flex-col overflow-hidden p-0">
        {/* --------- WhatsApp tarzı başlık --------- */}
        <div className="flex items-center gap-3 border-b border-[#0d1e26] bg-[#202c33] px-4 py-2.5">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-lg shadow">
            🤖
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#202c33] bg-emerald-400" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-sm font-bold text-white">10A Asistan</h1>
            <p className="truncate text-[11px] text-slate-400">
              {provider ? `${provider.label} · ${provider.model}` : "bağlanıyor..."}
            </p>
          </div>
          {provider && (
            <span
              className={`hidden rounded-full px-3 py-1 text-[11px] font-semibold sm:block ${
                provider.id === "local" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {provider.id === "local" ? "yerleşik mod" : "çevrimiçi"}
            </span>
          )}
        </div>

        {/* --------- Mesaj alanı --------- */}
        <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3" style={CHAT_BG_STYLE}>
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center px-4">
              <div className="max-w-sm rounded-xl bg-[#182229]/90 px-4 py-3 text-center text-xs leading-relaxed text-slate-400 shadow">
                Selam <b className="text-slate-200">{me.name.split(" ")[0]}</b>! 👋
                <br />
                Ödev sorabilir, dosya bırakabilir; <b className="text-emerald-300">&quot;görsel üret&quot;</b>,{" "}
                <b className="text-emerald-300">&quot;araştır&quot;</b>, <b className="text-emerald-300">&quot;kod yaz&quot;</b>{" "}
                diyebilirsin. Önemli bilgilerini hafızama ekliyorum 🧠
              </div>
            </div>
          )}

          {messages.map((message, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const mine = message.role === "user";
            const grouped =
              !!prev &&
              prev.role === message.role &&
              dayKey(prev.createdAt) === dayKey(message.createdAt) &&
              new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt);

            const bubbleBg = mine ? BUBBLE_OUT : BUBBLE_IN;
            const bubbleText = mine ? "text-white" : "text-slate-100";
            const radius = mine
              ? grouped
                ? "rounded-lg"
                : "rounded-lg rounded-tr-none"
              : grouped
                ? "rounded-lg"
                : "rounded-lg rounded-tl-none";

            const artifactsMeta = metaOf(message, "_meta_artifacts") as { items?: AssistantArtifact[] } | null;
            const followupsMeta = metaOf(message, "_meta_followups") as { items?: string[] } | null;
            const imageResults = (message.actions ?? []).filter((a) => a.type === "generate_image" && a.ok && a.url);

            return (
              <div key={message.id}>
                {newDay && <DaySeparator iso={message.createdAt} />}
                <div
                  className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}
                >
                  {!mine && (
                    <span className="w-8 shrink-0" aria-hidden>
                      {!grouped && (
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm shadow">
                          🤖
                        </span>
                      )}
                    </span>
                  )}
                  <div className={`relative max-w-[85%] ${mine ? "order-first" : ""}`}>
                    {!grouped && (
                      <span
                        aria-hidden
                        className={`absolute top-0 h-3 w-3 ${mine ? "right-[-7px]" : "left-[-7px]"}`}
                        style={{
                          background: bubbleBg,
                          clipPath: mine ? "polygon(0 0, 100% 0, 100% 100%)" : "polygon(0 0, 100% 0, 0 100%)",
                        }}
                      />
                    )}
                    <div
                      className={`relative whitespace-pre-wrap break-words px-2.5 py-1.5 text-[13.5px] leading-relaxed shadow-sm ${bubbleBg} ${bubbleText} ${radius}`}
                    >
                      <span>{message.content}</span>

                      {imageResults.map((r, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={r.url}
                          alt={r.summary ?? "üretilen görsel"}
                          className="mt-1.5 max-h-72 w-auto max-w-full rounded-lg border border-white/10"
                          loading="lazy"
                        />
                      ))}
                      {artifactsMeta?.items?.map((artifact, i) => <ArtifactCard key={i} artifact={artifact} />)}

                      <div
                        className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none ${
                          mine ? "text-emerald-100/75" : "text-slate-400/80"
                        }`}
                      >
                        <span>{timeLabel(message.createdAt)}</span>
                        {mine && <span className="text-[9px] tracking-tighter">✓✓</span>}
                      </div>

                      {message.id === lastAssistantId && followupsMeta?.items && followupsMeta.items.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {followupsMeta.items.map((f, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => void ask(f)}
                              disabled={loading}
                              className="rounded-full border border-[#00a884]/50 bg-[#00a884]/10 px-2.5 py-1 text-[11px] text-emerald-200 transition hover:bg-[#00a884]/25 hover:text-white"
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="mt-2 flex items-end gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm shadow">
                🤖
              </span>
              <div className="relative rounded-lg rounded-tl-none bg-[#202c33] px-3 py-2.5 shadow-sm">
                <span aria-hidden className="absolute left-[-7px] top-0 h-3 w-3" style={{ background: BUBBLE_IN, clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
                <span className="inline-flex items-center gap-1">
                  <span className="dot-typing h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                  <span className="dot-typing h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                  <span className="dot-typing h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* --------- Ek şeridi --------- */}
        {staged.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-[#0d1e26] bg-[#111b21] px-3 py-2">
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

        {/* --------- Giriş alanı (pill) --------- */}
        <div className="border-t border-[#0d1e26] bg-[#111b21] px-3 py-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="flex items-end gap-2"
          >
            <div className="flex min-h-[44px] flex-1 items-end gap-1 rounded-3xl bg-[#2a3942] px-2 py-1.5">
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
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || staged.length >= MAX_FILES}
                title="Fotoğraf veya PDF ekle"
                aria-label="Dosya ekle"
              >
                📎
              </button>
              <button
                type="button"
                onClick={() => setResearch((v) => !v)}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-base transition ${
                  research ? "bg-[#00a884]/20 text-emerald-300" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
                title="Araştırma Modu: cevaplamadan önce web'de arar"
                aria-label="Araştırma modu"
              >
                🔬
              </button>
              <textarea
                ref={inputRef}
                className="max-h-24 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] text-slate-100 outline-none placeholder:text-slate-500"
                value={input}
                rows={1}
                onChange={(e) => {
                  setInput(e.target.value);
                  growTextarea(e.target);
                }}
                placeholder={research ? "Araştırma modu açık — ne araştırayım?" : "Asistana sor ya da komut ver..."}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-400 disabled:opacity-40"
              disabled={loading || (!input.trim() && staged.length === 0)}
              aria-label="Gönder"
            >
              {loading ? <span className="animate-pulse text-xs">···</span> : <SendIcon className="h-5 w-5" />}
            </button>
          </form>
          {research && (
            <p className="mt-1.5 pl-2 text-[10px] text-emerald-300/90">
              🔬 Araştırma modu açık: cevaplamadan önce web&apos;de arar, kaynakları gösterir.
            </p>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-bold text-white">📁 Projeler</h2>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveProject(null);
                void load();
              }}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                activeProject === null
                  ? "border-emerald-400 bg-emerald-500/20 text-white"
                  : "border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white"
              }`}
            >
              Genel
            </button>
            {projects.map((p) => (
              <span key={p.id} className="relative inline-flex">
                <button
                  type="button"
                  onClick={() => {
                    setActiveProject(p.id);
                    void load();
                  }}
                  className={`rounded-lg border px-2.5 py-1 pr-5 text-xs font-semibold transition ${
                    activeProject === p.id
                      ? "border-emerald-400 bg-emerald-500/20 text-white"
                      : "border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white"
                  }`}
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteProjectDo(p.id)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 hover:text-rose-300"
                  aria-label={`${p.name} projesini sil`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              className="input px-2 py-1 text-xs"
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              placeholder="Yeni proje adı..."
              maxLength={60}
              onKeyDown={(e) => e.key === "Enter" && void createProjectDo()}
            />
            <button type="button" onClick={() => void createProjectDo()} className="btn btn-ghost px-2 py-1 text-xs">
              ➕
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">
            Her projenin kendi sohbeti olur; proje seçiliyken yazdıkların o projeye kaydedilir.
          </p>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-sm font-bold text-white">🧠 Hafıza ({memories.length})</h2>
          {memories.length === 0 ? (
            <p className="text-xs text-slate-500">
              Henüz bir şey öğrenmedi. Sohbette önemli bilgiler verirsen (hedefler, tercihler) kendiliğinden kaydeder;
              &quot;beni hatırla: ...&quot; diye de öğretebilirsin.
            </p>
          ) : (
            <ul className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
              {memories.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start gap-2 rounded-lg bg-slate-900/60 px-2 py-1.5 text-xs text-slate-200"
                >
                  <span className="min-w-0 flex-1">{m.content}</span>
                  <button
                    type="button"
                    onClick={() => void deleteMemoryDo(m.id)}
                    className="text-slate-500 hover:text-rose-300"
                    aria-label="Hatırlatmayı sil"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-sm font-bold text-white">⚡ Hızlı komutlar</h2>
          <div className="space-y-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => void ask(suggestion)}
                disabled={loading}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-emerald-500/50 hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </section>

        <section className="card p-4 text-xs leading-relaxed text-slate-400">
          <h2 className="mb-2 text-sm font-bold text-white">🧩 Yetenekler</h2>
          <ul className="space-y-1 text-[11px] text-slate-300">
            <li>🎨 <b>Görsel üretimi</b> — ücretsiz model (anahtarsız)</li>
            <li>🔬 <b>Araştırma modu</b> — web araması + kaynaklar</li>
            <li>🧠 <b>Uzun vadeli hafıza</b> — seni tanır</li>
            <li>🧩 <b>Artifact</b> — HTML/SVG önizleme, kod indir</li>
            <li>▶ <b>Kod çalıştırma</b> — JS/Python tarayıcı sandbox&apos;ında</li>
            <li>❓ <b>Takip soruları</b> — tıkla-devam et</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
