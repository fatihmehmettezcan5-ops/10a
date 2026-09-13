"use client";

import { useEffect, useRef, useState } from "react";
import { api, type ChatItem, type Me } from "@/lib/client";

export default function ChatPanel({
  me,
  messages,
  setMessages,
  draft,
  setDraft,
  notify,
}: {
  me: Me;
  messages: ChatItem[];
  setMessages: React.Dispatch<React.SetStateAction<ChatItem[]>>;
  draft: string;
  setDraft: (value: string) => void;
  notify: (text: string) => void;
}) {
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    async function pull() {
      try {
        const lastId = messages.length ? messages[messages.length - 1].id : 0;
        const data = await api<{ messages: ChatItem[] }>(`/api/messages?after=${lastId}`);
        if (data.messages.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...prev, ...data.messages.filter((m) => !seen.has(m.id))];
          });
        }
      } catch {
        /* sessizce yoksay */
      }
    }
    const timer = window.setInterval(() => {
      if (!document.hidden) void pull();
    }, 4000);
    // Sekmeye geri dönüldüğünde beklemadan senkronize et.
    const onVisible = () => {
      if (!document.hidden) void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [messages, setMessages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const match = body.match(/#(\d+)/);
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({ body, homeworkId: match ? Number(match[1]) : null }),
      });
      setDraft("");
      const data = await api<{ messages: ChatItem[] }>("/api/messages");
      setMessages(data.messages);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card flex h-[72vh] flex-col p-4">
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-lg font-bold text-white">💬 Sınıf Sohbeti</h1>
          <p className="text-xs text-slate-400">
            Herkese açık grup. Ödev numarasını <span className="font-mono">#3</span> gibi yazarsan mesaj o ödeve
            bağlanır.
          </p>
        </div>
        <span className="hidden rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] text-emerald-300 sm:block">
          canlı · 4 sn
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">
            Henüz mesaj yok. İlk mesajı sen yaz! 👋
          </p>
        )}
        {messages.map((message) => {
          const mine = message.userId === me.id;
          return (
            <div key={message.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <span
                className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                style={{ background: message.authorColor }}
              >
                {message.authorName.slice(0, 1).toLocaleUpperCase("tr-TR")}
              </span>
              <div className={`max-w-[78%] ${mine ? "text-right" : ""}`}>
                <div className="text-[11px] text-slate-400">
                  {mine ? "Sen" : message.authorName}
                  {message.authorRole === "admin" && " · başkan"}
                  <span className="ml-2 text-slate-600">
                    {new Date(message.createdAt).toLocaleTimeString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div
                  className={`mt-1 inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "rounded-tr-sm bg-gradient-to-br from-indigo-500 to-violet-600 text-white"
                      : "rounded-tl-sm border border-slate-700/70 bg-slate-800/70 text-slate-100"
                  }`}
                >
                  {message.homeworkId && (
                    <span className="mr-1 rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold">
                      ödev #{message.homeworkId}
                    </span>
                  )}
                  {message.body}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
        <input
          className="input flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Mesajını yaz... (ör: #2 ödevini kim yaptı?)"
          maxLength={1200}
        />
        <button className="btn btn-primary" disabled={sending || !draft.trim()}>
          Gönder
        </button>
      </form>
    </div>
  );
}
