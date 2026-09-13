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

type StagedFile = { file: File; previewUrl: string | null };

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sekme başlığındaki "yeni mesaj" rozetini yönet
  const mentionBell = useRef(false);

  useEffect(() => {
    api<{ members: DirectoryMember[] }>("/api/directory")
      .then((d) => setMembers(d.members))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    async function pull() {
      try {
        const lastId = messages.length ? messages[messages.length - 1].id : 0;
        const data = await api<{ messages: ChatItem[] }>(`/api/messages?after=${lastId}`);
        if (data.messages.length) {
          // Yeni mesajlarda senden bahsedildiyse bildir + sekme başlığını işaretle
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

  const mentionCandidates = mentionQuery === null ? [] : members
    .filter((m) => m.id !== me.id && m.name.toLocaleLowerCase("tr-TR").includes(mentionQuery))
    .slice(0, 5);

  function pickMention(member: DirectoryMember) {
    setDraft(draft.replace(/@([\p{L}\p{N}_.]*)$/u, `@${member.name} `));
    setMentionIds((prev) => (prev.includes(member.id) ? prev : [...prev, member.id]));
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  /* ---------------------------- GÖNDERİM ---------------------------- */

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
    // @bahsetme vurgusu: boşluklara göre böl, @ ile başlayan kelimeleri boya.
    const tokens = body.split(/(\s+)/);
    return tokens.map((token, i) => {
      if (token.startsWith("@") && token.length > 1) {
        return (
          <span key={i} className="rounded bg-indigo-500/30 px-1 font-semibold text-indigo-200">
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
      <div className="mt-2 space-y-2">
        {atts.map((att) => {
          const ext = externalUrl(att);
          const src = ext ?? att.url;
          if (att.kind === "image") {
            return (
              <a key={att.id} href={src} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={att.name}
                  className="max-h-64 w-auto max-w-full rounded-xl border border-white/10 object-cover"
                  loading="lazy"
                />
              </a>
            );
          }
          if (att.kind === "video") {
            return (
              <video key={att.id} src={src} controls className="max-h-64 w-full max-w-sm rounded-xl" />
            );
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
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:opacity-90 ${
                mine ? "bg-black/25 text-white" : "bg-slate-900/70 text-slate-200"
              }`}
            >
              <span aria-hidden>{fileIcon(att.mime, att.name)}</span>
              <span className="max-w-40 truncate">{att.name}</span>
              {att.size > 0 && <span className="text-[10px] opacity-70">{humanSize(att.size)}</span>}
            </a>
          );
        })}
      </div>
    );
  }

  const aiCandidate = mentionCandidates.length > 0;

  return (
    <div className="card flex h-[72vh] flex-col p-4">
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-lg font-bold text-white">💬 Sınıf Sohbeti</h1>
          <p className="text-xs text-slate-400">
            Dosya/görsel paylaş; <span className="font-mono">@</span> ile arkadaşını pingle;{" "}
            <span className="font-mono text-emerald-300">@10Asistan</span> yazıp yapay zekâyı sohbete çağır.
          </p>
        </div>
        <span className="hidden rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] text-emerald-300 sm:block">
          canlı · 4 sn
        </span>
      </div>

      <div
        className="flex-1 space-y-3 overflow-y-auto pr-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">
            Henüz mesaj yok. İlk mesajı sen yaz! 👋
          </p>
        )}
        {messages.map((message) => {
          const mine = message.userId === me.id;
          const isAi = message.authorRole === "ai" || message.userId === null;
          const mentionedMe = message.mentions?.includes(me.id);
          return (
            <div key={message.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <span
                className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                style={{ background: message.authorColor }}
              >
                {isAi ? "🤖" : message.authorName.slice(0, 1).toLocaleUpperCase("tr-TR")}
              </span>
              <div className={`max-w-[78%] ${mine ? "text-right" : ""}`}>
                <div className="text-[11px] text-slate-400">
                  {mine ? "Sen" : message.authorName}
                  {isAi ? (
                    <span className="ml-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                      YAPAY ZEKÂ
                    </span>
                  ) : (
                    message.authorRole === "admin" && " · başkan"
                  )}
                  {mentionedMe && (
                    <span className="ml-1 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300">
                      senden bahsetti
                    </span>
                  )}
                  <span className="ml-2 text-slate-600">
                    {new Date(message.createdAt).toLocaleTimeString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div
                  className={`mt-1 inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-sm ${
                    mine
                      ? "rounded-tr-sm bg-gradient-to-br from-indigo-500 to-violet-600 text-white"
                      : isAi
                        ? "rounded-tl-sm border border-emerald-500/40 bg-slate-800/80 text-slate-100"
                        : "rounded-tl-sm border border-slate-700/70 bg-slate-800/70 text-slate-100"
                  }`}
                >
                  {message.homeworkId && (
                    <span className="mr-1 rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold">
                      ödev #{message.homeworkId}
                    </span>
                  )}
                  {renderBody(message.body)}
                  {renderAttachments(message.attachments ?? [], mine)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {staged.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 border-t border-slate-800 pt-2">
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

      <div className="relative">
        {aiCandidate && (
          <div className="absolute bottom-full left-0 z-10 mb-2 w-64 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
            {mentionCandidates.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => pickMention(member)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-indigo-500/20"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded text-[10px] font-bold text-white"
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
              className="flex w-full items-center gap-2 border-t border-slate-800 px-3 py-2 text-left text-sm text-emerald-300 transition hover:bg-emerald-500/10"
            >
              <span aria-hidden>🤖</span> 10Asistan (yapay zekâ)
            </button>
          </div>
        )}

        <form onSubmit={send} className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
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
            className="btn btn-ghost px-3"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || busyUpload || staged.length >= CHAT_MAX_FILES}
            title="Dosya/görsel ekle (sürükle-bırak da olur)"
          >
            📎
          </button>
          <textarea
            ref={inputRef}
            className="input max-h-24 min-h-[42px] flex-1 resize-none py-2"
            value={draft}
            rows={1}
            onChange={(e) => {
              setDraft(e.target.value);
              updateMentionQuery(e.target.value);
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
            placeholder="Mesaj yaz... (@ ile pingle, 📎 ile dosya ekle)"
            maxLength={1200}
          />
          <button
            className="btn btn-primary"
            disabled={sending || busyUpload || (!draft.trim() && staged.length === 0)}
          >
            {sending || busyUpload ? "..." : "Gönder"}
          </button>
        </form>
      </div>
    </div>
  );
}
