"use client";

import { useEffect, useRef, useState } from "react";
import { api, type ChatItem, type DirectoryMember, type Me } from "@/lib/client";
import {
  externalUrl,
  fileIcon,
  humanSize,
  CHAT_MAX_FILES,
  CHAT_MAX_FILE_BYTES,
  type ChatAttachment,
} from "@/lib/attachments";
import { BUBBLE_IN, BUBBLE_OUT, CHAT_BG_STYLE, dayKey, dayLabel, timeLabel, withinGroup } from "@/lib/chat-ui";

type StagedFile = { file: File; previewUrl: string | null };

function SendIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
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
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const [busyUpload, setBusyUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionBell = useRef(false);
  const stickToBottom = useRef(true);

  useEffect(() => {
    api<{ members: DirectoryMember[] }>("/api/directory")
      .then((d) => setMembers(d.members))
      .catch(() => {});
  }, []);

  // Kullanıcı en alttayken yeni mesaj gelince otomatik kaydır; yukarıdaysa dokunma.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    async function pull() {
      try {
        const lastId = messages.length ? messages[messages.length - 1].id : 0;
        const data = await api<{ messages: ChatItem[] }>(`/api/messages?after=${lastId}`);
        if (data.messages.length) {
          for (const m of data.messages) {
            if (m.mentions?.includes(me.id) && m.userId !== me.id) {
              notify(`💬 ${m.authorName} senden bahsetti`);
              mentionBell.current = true;
            }
          }
          if (mentionBell.current) document.title = "(💬) 10/A Paneli";
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
    const onVisible = () => {
      if (!document.hidden) {
        void pull();
        if (mentionBell.current) {
          mentionBell.current = false;
          document.title = "10/A Paneli";
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [messages, setMessages, me.id, notify]);

  /* ------------------------------ EKLER ------------------------------ */

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const next = [...staged];
    let error = "";
    for (const file of Array.from(list)) {
      if (next.length >= CHAT_MAX_FILES) {
        error = `Bir mesaja en fazla ${CHAT_MAX_FILES} dosya ekleyebilirsin.`;
        break;
      }
      if (file.size > CHAT_MAX_FILE_BYTES) {
        error = `"${file.name}" çok büyük (en fazla 6 MB).`;
        continue;
      }
      next.push({ file, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null });
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

  /* --------------------------- @PINGLEME ---------------------------- */

  function updateMentionQuery(value: string) {
    const match = value.match(/@([\p{L}\p{N}_.]*)$/u);
    setMentionQuery(match ? match[1].toLocaleLowerCase("tr-TR") : null);
  }

  const mentionCandidates =
    mentionQuery === null
      ? []
      : members
          .filter((m) => m.id !== me.id && m.name.toLocaleLowerCase("tr-TR").includes(mentionQuery))
          .slice(0, 5);

  function pickMention(member: DirectoryMember) {
    setDraft(draft.replace(/@([\p{L}\p{N}_.]*)$/u, `@${member.name} `));
    setMentionIds((prev) => (prev.includes(member.id) ? prev : [...prev, member.id]));
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  /* ---------------------------- GÖNDERİM ---------------------------- */

  function growTextarea(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }

  async function uploadStaged(): Promise<ChatAttachment[]> {
    if (!staged.length) return [];
    setBusyUpload(true);
    try {
      const form = new FormData();
      staged.forEach((s) => form.append("files", s.file));
      const data = await api<{ attachments: ChatAttachment[] }>("/api/files", {
        method: "POST",
        body: form,
      });
      return data.attachments;
    } finally {
      setBusyUpload(false);
    }
  }

  async function send(e?: React.SyntheticEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if ((!body && staged.length === 0) || sending) return;
    setSending(true);
    try {
      const attachments = await uploadStaged();
      const match = body.match(/#(\d+)/);
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          body,
          homeworkId: match ? Number(match[1]) : null,
          attachments,
          mentions: mentionIds,
        }),
      });
      setDraft("");
      setMentionIds([]);
      setMentionQuery(null);
      clearStaged();
      stickToBottom.current = true;
      const data = await api<{ messages: ChatItem[] }>("/api/messages");
      setMessages(data.messages);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  /* --------------------------- GÖRÜNÜM ------------------------------ */

  function renderBody(body: string) {
    const tokens = body.split(/(\s+)/);
    return tokens.map((token, i) => {
      if (token.startsWith("@") && token.length > 1) {
        return (
          <span key={i} className="font-medium text-[#53bdeb]">
            {token}
          </span>
        );
      }
      return <span key={i}>{token}</span>;
    });
  }

  function renderAttachments(atts: ChatAttachment[], mine: boolean) {
    if (!atts?.length) return null;
    return (
      <div className="mt-1.5 space-y-1.5">
        {atts.map((att) => {
          const ext = externalUrl(att);
          const src = ext ?? att.url;
          if (att.kind === "image") {
            return (
              <a key={att.id} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={att.name}
                  className="max-h-72 w-auto max-w-full rounded-lg object-cover transition hover:scale-[1.01]"
                  loading="lazy"
                />
              </a>
            );
          }
          if (att.kind === "video") {
            return <video key={att.id} src={src} controls className="max-h-72 w-full max-w-sm rounded-lg" />;
          }
          if (att.kind === "audio") {
            return <audio key={att.id} src={src} controls className="w-full max-w-xs" />;
          }
          return (
            <a
              key={att.id}
              href={src}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-110 ${
                mine ? "bg-black/25 text-white" : "bg-[#111b21] text-slate-200"
              }`}
            >
              <span aria-hidden className="text-base">{fileIcon(att.mime, att.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block max-w-44 truncate">{att.name}</span>
                {att.size > 0 && <span className="block text-[10px] opacity-60">{humanSize(att.size)}</span>}
              </span>
              <span aria-hidden className="text-sm opacity-60">⬇</span>
            </a>
          );
        })}
      </div>
    );
  }

  return (
    <div className="card flex h-[76vh] flex-col overflow-hidden p-0">
      {/* --------- WhatsApp tarzı başlık --------- */}
      <div className="flex items-center gap-3 border-b border-[#0d1e26] bg-[#202c33] px-4 py-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-lg shadow">
          🎓
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-sm font-bold text-white">10/A Sınıf Sohbeti</h1>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {members.length > 0 ? `${members.length} üye · canlı` : "canlı"} · her 4 sn&apos;de yenilenir
          </p>
        </div>
        <span className="hidden rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-300 sm:block">
          📎 dosya · @ pingle · @10Asistan
        </span>
      </div>

      {/* --------- Mesaj alanı --------- */}
      <div
        ref={scrollRef}
        className={`flex-1 space-y-0.5 overflow-y-auto px-3 py-3 transition ${dragOver ? "ring-2 ring-inset ring-emerald-500/60" : ""}`}
        style={CHAT_BG_STYLE}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="rounded-xl bg-[#182229]/90 px-4 py-3 text-center text-xs text-slate-400 shadow">
              🔒 Mesajlar yalnızca sınıf üyelerine görünür.
              <br />
              İlk mesajı sen yaz! 👋
            </p>
          </div>
        )}

        {messages.map((message, idx) => {
          const prev = idx > 0 ? messages[idx - 1] : null;
          const mine = message.userId === me.id;
          const isAi = message.authorRole === "ai" || message.userId === null;
          const grouped = withinGroup(prev, message);
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt);
          const mentionedMe = message.mentions?.includes(me.id);

          const bubbleBg = mine ? BUBBLE_OUT : BUBBLE_IN;
          const bubbleText = mine ? "text-white" : "text-slate-100";
          const radius = mine
            ? grouped
              ? "rounded-lg"
              : "rounded-lg rounded-tr-none"
            : grouped
              ? "rounded-lg"
              : "rounded-lg rounded-tl-none";

          return (
            <div key={message.id}>
              {newDay && <DaySeparator iso={message.createdAt} />}
              <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}>
                {!mine && (
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-end text-center text-xs font-bold text-white"
                    aria-hidden
                  >
                    {grouped ? (
                      <span className="w-8" />
                    ) : (
                      <span
                        className="grid h-8 w-8 place-items-center rounded-full shadow"
                        style={{ background: isAi ? "#00a884" : message.authorColor }}
                      >
                        {isAi ? "🤖" : message.authorName.slice(0, 1).toLocaleUpperCase("tr-TR")}
                      </span>
                    )}
                  </span>
                )}

                <div className={`relative max-w-[80%] sm:max-w-[70%] ${mine ? "order-first" : ""}`}>
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
                    {!mine && !grouped && (
                      <div className="mb-0.5 flex items-center gap-1.5 text-[12.5px] font-bold leading-tight">
                        <span style={{ color: isAi ? "#00a884" : message.authorColor }}>
                          {isAi ? "10A Asistan" : message.authorName}
                        </span>
                        {isAi && (
                          <span className="rounded bg-emerald-500/20 px-1 py-px text-[9px] font-bold text-emerald-300">
                            YAPAY ZEKÂ
                          </span>
                        )}
                        {message.authorRole === "admin" && !isAi && (
                          <span className="rounded bg-amber-500/15 px-1 py-px text-[9px] font-bold text-amber-300">
                            başkan
                          </span>
                        )}
                      </div>
                    )}
                    {mentionedMe && !mine && (
                      <div className="mb-0.5 inline-block rounded bg-[#182229] px-1.5 py-px text-[10px] font-semibold text-[#53bdeb]">
                        ↩ senden bahsetti
                      </div>
                    )}

                    {message.homeworkId && (
                      <span className="mr-1 rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold">
                        ödev #{message.homeworkId}
                      </span>
                    )}
                    <span>{renderBody(message.body)}</span>
                    {renderAttachments(message.attachments ?? [], mine)}

                    <div
                      className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none ${
                        mine ? "text-emerald-100/75" : "text-slate-400/80"
                      }`}
                    >
                      <span>{timeLabel(message.createdAt)}</span>
                      {mine && <span className="text-[9px] tracking-tighter">✓✓</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
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
                <span aria-hidden>📎</span>
              )}
              <span className="max-w-36 truncate">{item.file.name}</span>
              <span className="text-[10px] text-slate-500">{humanSize(item.file.size)}</span>
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

      {/* --------- Giriş alanı (WhatsApp pill) --------- */}
      <div className="relative border-t border-[#0d1e26] bg-[#111b21] px-3 py-2.5">
        {mentionCandidates.length > 0 && (
          <div className="absolute bottom-full left-3 z-10 mb-2 w-64 overflow-hidden rounded-xl border border-slate-700 bg-[#233138] shadow-2xl">
            {mentionCandidates.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => pickMention(member)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: member.color }}
                >
                  {member.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                </span>
                {member.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setDraft(`${draft.replace(/@([\p{L}\p{N}_.]*)$/u, "@10Asistan ")}`);
                setMentionQuery(null);
                inputRef.current?.focus();
              }}
              className="flex w-full items-center gap-2 border-t border-white/5 px-3 py-2 text-left text-sm text-emerald-300 transition hover:bg-emerald-500/10"
            >
              <span aria-hidden>🤖</span> 10Asistan (yapay zekâ)
            </button>
          </div>
        )}

        <form onSubmit={send} className="flex items-end gap-2">
          <div className="flex min-h-[44px] flex-1 items-end gap-1 rounded-3xl bg-[#2a3942] px-2 py-1.5">
            <input
              ref={fileInputRef}
              type="file"
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
              disabled={sending || busyUpload || staged.length >= CHAT_MAX_FILES}
              title="Dosya/görsel ekle (sürükle-bırak da olur)"
              aria-label="Dosya ekle"
            >
              📎
            </button>
            <textarea
              ref={inputRef}
              className="max-h-24 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] text-slate-100 outline-none placeholder:text-slate-500"
              value={draft}
              rows={1}
              onChange={(e) => {
                setDraft(e.target.value);
                updateMentionQuery(e.target.value);
                growTextarea(e.target);
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.length) {
                  e.preventDefault();
                  addFiles(files);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(e);
                }
              }}
              placeholder="Mesaj yaz..."
              maxLength={1200}
            />
          </div>
          <button
            type="submit"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-400 disabled:opacity-40"
            disabled={sending || busyUpload || (!draft.trim() && staged.length === 0)}
            aria-label="Gönder"
          >
            {sending || busyUpload ? (
              <span className="animate-pulse text-xs">···</span>
            ) : (
              <SendIcon className="h-5 w-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
