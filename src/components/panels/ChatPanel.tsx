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

type MenuState = { messageId: number; x: number; y: number } | null;
const MENU_W = 224;   // w-56
const MENU_H = 260;   // yaklaşık menü yüksekliği (5 öğe)
const EDIT_WINDOW_MS = 15 * 60 * 1000;

function ReadInfoList({
  reads,
  authorCount,
  onClose,
}: {
  reads: { userId: number; name: string; readAt: string }[];
  authorCount: number;
  onClose: () => void;
}) {
  const others = reads.slice().sort((a, b) => a.readAt.localeCompare(b.readAt));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-xs overflow-hidden rounded-2xl bg-[#233138] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Görüldü bilgisi"
      >
        <div className="border-b border-white/5 px-4 py-3">
          <h3 className="text-sm font-bold text-white">👀 Görüldü bilgisi</h3>
          <p className="text-[11px] text-slate-400">
            {others.length}/{Math.max(authorCount - 1, 0)} üye gördü
          </p>
        </div>
        <ul className="max-h-64 overflow-y-auto px-2 py-2">
          {others.length === 0 && <li className="px-2 py-3 text-center text-xs text-slate-500">Henüz kimse görmedi.</li>}
          {others.map((r) => (
            <li key={r.userId} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/5">
              <span className="min-w-0 flex-1 truncate text-slate-200">{r.name}</span>
              <span className="shrink-0 text-[10px] text-slate-400">
                {new Date(r.readAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

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
  const [menu, setMenu] = useState<MenuState>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [readInfoId, setReadInfoId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatItem | null>(null);
  const [swipe, setSwipe] = useState<{ id: number; dx: number } | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const touchOrigin = useRef<{ id: number; x: number; y: number; horizontal: boolean } | null>(null);
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

  useEffect(() => {
    if (!menu) return;
    // Menü ekran dışına taşıyorsa gerçek boyutuyla içeri al (alt kenar sorunu)
    const el = menuRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let { x, y } = menu;
      if (x + MENU_W + 8 > vw) x = vw - MENU_W - 8;
      if (x < 8) x = 8;
      if (y + rect.height + 12 > vh) y = vh - rect.height - 12;
      if (y < 8) y = 8;
      if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x, y });
    }
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

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
        const data = await api<{ messages: ChatItem[] }>(`/api/messages?after=${lastId}&reads=1`);
        void api("/api/messages/actions", { method: "POST", body: JSON.stringify({ action: "read" }) }).catch(() => {});
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

  /* --------------------------- CEVAP (REPLY) ------------------------- */

  function jumpToMessage(id: number) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) {
      notify("Alıntılanan mesaj görünürde değil (eski mesajlar yüklenmemiş olabilir).");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    window.setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1400);
  }

  function onTouchStartFactory(id: number) {
    return (e: React.TouchEvent) => {
      const t = e.touches[0];
      touchOrigin.current = { id, x: t.clientX, y: t.clientY, horizontal: false };
    };
  }

  function onTouchMoveFactory(id: number) {
    return (e: React.TouchEvent) => {
      const origin = touchOrigin.current;
      if (!origin || origin.id !== id) return;
      const t = e.touches[0];
      const dx = t.clientX - origin.x;
      const dy = t.clientY - origin.y;
      if (!origin.horizontal) {
        // Yatay niyet: dikey kaydırmadan belirgin biçimde ayrışınca yakala.
        if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.6) origin.horizontal = true;
        else return;
      }
      e.preventDefault?.();
      if (dx > 0 && dx <= 96) setSwipe({ id, dx });
    };
  }

  function onTouchEndFactory(id: number) {
    return () => {
      const origin = touchOrigin.current;
      touchOrigin.current = null;
      if (origin?.id !== id) return;
      if (swipe && swipe.id === id && swipe.dx > 52) {
        const target = messages.find((m) => m.id === id);
        if (target && !target.deletedForAll) setReplyTo(target);
      }
      setSwipe(null);
    };
  }

  /* ------------------------- MESAJ AKSİYONLARI ---------------------- */

  const menuMessage = menu ? messages.find((m) => m.id === menu.messageId) ?? null : null;
  const canDeleteAll = (m: ChatItem) => (m.userId === me.id || me.role === "admin") && !m.deletedForAll;
  const canEdit = (m: ChatItem) =>
    m.userId === me.id && !m.deletedForAll && Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS;

  async function deleteForAll(id: number) {
    try {
      await api("/api/messages/actions", { method: "POST", body: JSON.stringify({ action: "deleteForAll", messageId: id }) });
      const data = await api<{ messages: ChatItem[] }>("/api/messages?reads=1");
      setMessages(data.messages);
      notify("Mesaj herkesten silindi 🗑️");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Silinemedi.");
    }
  }

  async function deleteForMe(id: number) {
    try {
      await api("/api/messages/actions", { method: "POST", body: JSON.stringify({ action: "deleteForMe", messageId: id }) });
      setMessages((prev) => prev.filter((m) => m.id !== id));
      notify("Mesaj senin için silindi");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Silinemedi.");
    }
  }

  async function saveEdit(id: number) {
    const body = editDraft.trim();
    if (!body) return;
    try {
      await api("/api/messages/actions", { method: "POST", body: JSON.stringify({ action: "edit", messageId: id, body }) });
      setEditingId(null);
      setEditDraft("");
      const data = await api<{ messages: ChatItem[] }>("/api/messages?reads=1");
      setMessages(data.messages);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Düzenlenemedi.");
    }
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
          replyTo: replyTo?.id ?? null,
        }),
      });
      setDraft("");
      setMentionIds([]);
      setMentionQuery(null);
      setReplyTo(null);
      clearStaged();
      stickToBottom.current = true;
      const data = await api<{ messages: ChatItem[] }>("/api/messages?reads=1");
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

  const readInfoMessage = readInfoId ? messages.find((m) => m.id === readInfoId) : null;

  return (
    <div className="card flex h-[76vh] flex-col overflow-hidden p-0">
      {menu && menuMessage && (
        <div
          ref={menuRef}
          className="fixed z-50 w-56 overflow-hidden rounded-xl bg-[#233138] py-1 shadow-2xl ring-1 ring-white/10"
          style={{
            left: Math.max(8, Math.min(menu.x - 8, (typeof window !== "undefined" ? window.innerWidth : 400) - MENU_W - 8)),
            top: Math.max(8, Math.min(menu.y - 4, (typeof window !== "undefined" ? window.innerHeight : 600) - MENU_H - 12)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuMessage.userId === me.id && me.role !== "admin" && (
            <p className="px-3 py-1.5 text-[10px] text-slate-500">Sohbetteki son 15 dk içinde düzenleyebilirsin</p>
          )}
          <button
            type="button"
            onClick={() => {
              setReplyTo(menuMessage);
              setMenu(null);
              inputRef.current?.focus();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/5"
          >
            ↩ Cevap ver
          </button>
          {canEdit(menuMessage) && (
            <button
              type="button"
              onClick={() => {
                setEditingId(menuMessage.id);
                setEditDraft(menuMessage.body);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/5"
            >
              ✏️ Düzenle
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(menuMessage.body);
              setMenu(null);
              notify("Mesaj kopyalandı 📋");
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/5"
          >
            📋 Kopyala
          </button>
          {menuMessage.userId === me.id && (
            <button
              type="button"
              onClick={() => {
                setReadInfoId(menuMessage.id);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/5"
            >
              👀 Görüldü bilgisi{" "}
              <span className="ml-auto text-[10px] text-slate-500">
                {menuMessage.reads.filter((r) => r.userId !== me.id).length}
              </span>
            </button>
          )}
          {canDeleteAll(menuMessage) && (
            <button
              type="button"
              onClick={() => {
                void deleteForAll(menuMessage.id);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-rose-300 hover:bg-rose-500/10"
            >
              🗑️ Herkes için sil
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void deleteForMe(menuMessage.id);
              setMenu(null);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5"
          >
            🚫 Benim için sil
          </button>
        </div>
      )}
      {readInfoMessage && (
        <ReadInfoList
          reads={readInfoMessage.reads.filter((r) => r.userId !== me.id)}
          authorCount={Math.max(members.length, 1)}
          onClose={() => setReadInfoId(null)}
        />
      )}
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
          const seenByOthers = message.reads.filter((r) => r.userId !== me.id);
          const isLastMine = mine && messages.slice(idx + 1).every((m) => m.userId !== me.id);

          const openMenu = (e: React.MouseEvent | React.TouchEvent) => {
            if (message.deletedForAll) return;
            e.preventDefault();
            const touch = "touches" in e;
            const pt = touch ? e.touches[0] : e;
            // Dokunmatikte menü parmağın üstünde kalmamalı: biraz yukarısında aç.
            setMenu({ messageId: message.id, x: pt.clientX, y: touch ? pt.clientY - 24 : pt.clientY });
          };

          const bubbleBg = mine ? BUBBLE_OUT : BUBBLE_IN;
          const bubbleText = mine ? "text-white" : "text-slate-100";
          const radius = mine
            ? grouped
              ? "rounded-lg"
              : "rounded-lg rounded-tr-none"
            : grouped
              ? "rounded-lg"
              : "rounded-lg rounded-tl-none";

          const swiping = swipe?.id === message.id;
          const highlight = highlightId === message.id;

          return (
            <div key={message.id} id={`msg-${message.id}`}>
              {newDay && <DaySeparator iso={message.createdAt} />}
              <div
                className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"} rounded-xl transition ${
                  highlight ? "bg-white/10 ring-1 ring-emerald-400/60" : ""
                }`}
              >
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
                    onContextMenu={(e) => openMenu(e)}
                    onTouchStart={onTouchStartFactory(message.id)}
                    onTouchMove={onTouchMoveFactory(message.id)}
                    onTouchEnd={onTouchEndFactory(message.id)}
                    style={swiping ? { transform: `translateX(${swipe.dx}px)`, transition: "none" } : undefined}
                    className={`msg-in relative whitespace-pre-wrap break-words px-2.5 py-1.5 text-[13.5px] leading-relaxed shadow-sm transition-transform [transition-property:transform,background-color] active:scale-[0.99] ${bubbleBg} ${bubbleText} ${radius} ${
                      message.deletedForAll ? "italic opacity-60" : "cursor-pointer select-none"
                    }`}
                    title="Uzun bas ya da sağ tıkla · sağa kaydırarak cevapla"
                  >
                    {message.deletedForAll ? (
                      <span className="flex items-center gap-1.5 text-[13px] text-slate-400">
                        <span aria-hidden>🚫</span> Bu mesaj silindi
                        <span className="ml-1 text-[10px] not-italic opacity-70">{message.authorName}</span>
                      </span>
                    ) : editingId === message.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="min-w-0 flex-1 rounded bg-black/30 px-2 py-1 text-[13px] text-white outline-none"
                          value={editDraft}
                          autoFocus
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveEdit(message.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <button type="button" onClick={() => void saveEdit(message.id)} className="text-xs text-emerald-300" aria-label="Kaydet">✓</button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-xs text-slate-400" aria-label="İptal">✕</button>
                      </div>
                    ) : (
                    <>
                    {message.replyTo && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          jumpToMessage(message.replyTo!.id);
                        }}
                        className="mb-1 flex w-full items-stretch gap-1.5 rounded-lg bg-black/25 text-left transition hover:bg-black/35"
                      >
                        <span className="w-1 shrink-0 rounded-full bg-emerald-400/80" />
                        <span className="min-w-0 py-1 pr-2">
                          <span className="block text-[11px] font-bold leading-tight text-emerald-300">
                            {message.replyTo.deletedForAll ? "Mesaj silindi" : message.replyTo.authorName || "…"}
                          </span>
                          <span className="block truncate text-[11.5px] leading-snug text-slate-300">
                            {message.replyTo.deletedForAll ? "🚫 Bu mesaj silindi" : message.replyTo.body || "…"}
                          </span>
                        </span>
                      </button>
                    )}
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
                    </>
                    )}

                    <div
                      className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none ${
                        mine ? "text-emerald-100/75" : "text-slate-400/80"
                      }`}
                    >
                      {message.edited && <span className="italic opacity-70">düzenlendi</span>}
                      <span>{timeLabel(message.createdAt)}</span>
                      {mine && message.deletedForAll && <span className="text-[9px] tracking-tighter">✓</span>}
                      {mine && !message.deletedForAll && (
                        <button
                          type="button"
                          className="text-[9px] tracking-tighter transition hover:scale-110"
                          title={seenByOthers.length ? `${seenByOthers.length} kişi gördü` : "Kimse görmedi"}
                          onClick={() => setReadInfoId(message.id)}
                        >
                          {isLastMine && seenByOthers.length ? "✓✓" : "✓"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* --------- Cevap şeridi --------- */}
      {replyTo && (
        <div className="flex items-center gap-2 border-t border-[#0d1e26] bg-[#111b21] px-3 py-2">
          <span aria-hidden className="text-emerald-400">↩</span>
          <span className="min-w-0 flex-1 rounded-lg bg-[#233138] px-2.5 py-1.5">
            <span className="block text-[11px] font-bold leading-tight text-emerald-300">
              {replyTo.userId === me.id ? "Sen" : replyTo.authorName}
            </span>
            <span className="block truncate text-[11.5px] text-slate-300">{replyTo.body}</span>
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-white/5 hover:text-white"
            aria-label="Cevabı iptal et"
          >
            ✕
          </button>
        </div>
      )}

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
