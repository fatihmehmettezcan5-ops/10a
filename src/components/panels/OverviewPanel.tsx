"use client";

import { useState } from "react";
import { api, type AnnouncementItem, type EventItem, type HomeworkItem, type Me, type MemberItem, type SlotItem, type Stats } from "@/lib/client";
import { VC_ORDER } from "@/lib/constants";
import type { TabId } from "@/components/Dashboard";
import {
  DAY_NAMES,
  EVENT_TYPE_EMOJI,
  STATUS_LABELS,
  STATUS_STYLES,
  daysUntil,
  formatDateTR,
  todayISO,
  type EventType,
  type HomeworkStatus,
} from "@/lib/constants";

export default function OverviewPanel({
  me,
  stats,
  homeworks,
  events,
  schedule,
  announcements,
  members,
  reloadAnnouncements,
  reloadMembers,
  notify,
  onGo,
}: {
  me: Me;
  stats: Stats | null;
  homeworks: HomeworkItem[];
  events: EventItem[];
  schedule: SlotItem[];
  announcements: AnnouncementItem[];
  members: MemberItem[];
  reloadAnnouncements: () => Promise<void>;
  reloadMembers: () => Promise<void>;
  notify: (text: string) => void;
  onGo: (tab: TabId) => void;
}) {
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annSaving, setAnnSaving] = useState(false);


  async function publishAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setAnnSaving(true);
    try {
      await api("/api/announcements", {
        method: "POST",
        body: JSON.stringify({ title: annTitle, body: annBody }),
      });
      setAnnTitle("");
      setAnnBody("");
      await reloadAnnouncements();
      notify("Duyuru yayınlandı 📢");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Duyuru yayınlanamadı.");
    } finally {
      setAnnSaving(false);
    }
  }

  async function removeAnnouncement(id: number) {
    try {
      await api(`/api/announcements/${id}`, { method: "DELETE" });
      await reloadAnnouncements();
      notify("Duyuru silindi.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Silinemedi.");
    }
  }
  const jsDay = new Date().getDay();
  const dayIndex = jsDay === 0 ? 7 : jsDay;
  const todayLessons = schedule
    .filter((s) => s.dayOfWeek === dayIndex)
    .sort((a, b) => a.period - b.period);

  const today = todayISO();
  const upcomingEvents = events
    .filter((e) => e.date >= today && !e.done)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const urgent = homeworks
    .filter((h) => h.status !== "done" && h.status !== "cancelled")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 5);

  const cards = [
    { label: "Açık ödev", value: stats?.open ?? 0, tone: "from-sky-500/20 to-sky-500/5", icon: "📚" },
    { label: "Tamamlanan", value: stats?.done ?? 0, tone: "from-emerald-500/20 to-emerald-500/5", icon: "✅" },
    { label: "Gecikmiş", value: stats?.overdue ?? 0, tone: "from-rose-500/20 to-rose-500/5", icon: "⚠️" },
    { label: "Sınıf mesajı", value: stats?.messages ?? 0, tone: "from-violet-500/20 to-violet-500/5", icon: "💬" },
  ];

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {formatDateTR(today)}
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-white">
              Merhaba {me.name.split(" ")[0]} 👋
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {todayLessons.length > 0 ? `Bugün ${todayLessons.length} ders var.` : "Bugün ders kaydı yok."}{" "}
              {stats && stats.overdue > 0 ? (
                <span className="font-semibold text-rose-300">{stats.overdue} ödevin süresi geçmiş!</span>
              ) : (
                "Her şey yolunda görünüyor."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => onGo("homework")}>
              ➕ Ödev ekle
            </button>
            <button className="btn btn-ghost" onClick={() => onGo("assistant")}>
              🤖 Asistana sor
            </button>
          </div>
        </div>
      </div>

      {announcements.length > 0 && (
        <section className="card border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
          <h2 className="mb-2 text-sm font-bold text-amber-200">📢 Duyurular</h2>
          <ul className="space-y-2">
            {announcements.map((a) => (
              <li key={a.id} className="rounded-lg bg-slate-900/50 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">{a.title}</div>
                    {a.body && <div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-300">{a.body}</div>}
                    <div className="mt-1 text-[10px] text-slate-500">
                      {a.authorName} · {formatDateTR(a.createdAt.slice(0, 10))}
                    </div>
                  </div>
                  {(me.role === "admin" || a.authorId === me.id) && (
                    <button
                      onClick={() => removeAnnouncement(a.id)}
                      className="shrink-0 text-slate-600 transition hover:text-rose-400"
                      aria-label="Duyuruyu sil"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {me.role === "admin" && (
        <form onSubmit={publishAnnouncement} className="card space-y-2 p-4">
          <h2 className="text-sm font-bold text-white">📢 Duyuru yayınla</h2>
          <input
            className="input"
            value={annTitle}
            onChange={(e) => setAnnTitle(e.target.value)}
            placeholder="Duyuru başlığı (örn. Yarın fizik yazılısı)"
            maxLength={120}
            required
          />
          <textarea
            className="input min-h-16"
            value={annBody}
            onChange={(e) => setAnnBody(e.target.value)}
            placeholder="Detay (isteğe bağlı) — saat, yer, notlar..."
            maxLength={2000}
          />
          <button className="btn btn-primary" disabled={annSaving || annTitle.trim().length < 2}>
            {annSaving ? "..." : "Sınıfa yayınla"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={`card bg-gradient-to-br ${card.tone} p-4`}>
            <div className="text-xl">{card.icon}</div>
            <div className="mt-1 text-3xl font-black text-white">{card.value}</div>
            <div className="text-xs text-slate-400">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4">
          <h2 className="mb-3 flex items-center justify-between text-sm font-bold text-white">
            <span>⏰ Bugünün dersleri</span>
            <span className="text-xs font-normal text-slate-400">
              {dayIndex <= 5 ? DAY_NAMES[dayIndex - 1] : "Hafta sonu"}
            </span>
          </h2>
          {todayLessons.length === 0 ? (
            <p className="text-sm text-slate-400">Bugün için ders kaydı yok.</p>
          ) : (
            <ul className="space-y-1.5">
              {todayLessons.map((slot) => (
                <li
                  key={slot.id}
                  className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2 text-sm"
                >
                  <span className="text-slate-200">
                    <span className="mr-2 text-xs text-slate-500">{slot.period}.</span>
                    {slot.subject}
                  </span>
                  <span className="text-xs text-slate-500">
                    {slot.startTime}–{slot.endTime}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-white">🗓️ Yaklaşan hatırlatıcılar</h2>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-slate-400">Takvimde yaklaşan kayıt yok.</p>
          ) : (
            <ul className="space-y-2">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="rounded-lg bg-slate-800/40 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-slate-100">
                    <span>{EVENT_TYPE_EMOJI[event.type as EventType] ?? "🔔"}</span>
                    <span className="font-medium">{event.title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {formatDateTR(event.date)}
                    {event.time ? ` · ${event.time}` : ""} ·{" "}
                    {event.scope === "class" ? "Sınıf" : "Kişisel"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-white">📚 Sıradaki ödevler</h2>
          {urgent.length === 0 ? (
            <p className="text-sm text-slate-400">Açık ödev yok, harikasın! 🎉</p>
          ) : (
            <ul className="space-y-2">
              {urgent.map((hw) => {
                const left = daysUntil(hw.dueDate);
                return (
                  <li key={hw.id} className="rounded-lg bg-slate-800/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-100">{hw.title}</span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
                          STATUS_STYLES[hw.status as HomeworkStatus] ?? ""
                        }`}
                      >
                        {STATUS_LABELS[hw.status as HomeworkStatus] ?? hw.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {hw.subject} ·{" "}
                      {left === null
                        ? "tarih yok"
                        : left < 0
                          ? `${Math.abs(left)} gün gecikti`
                          : left === 0
                            ? "bugün teslim"
                            : `${left} gün kaldı`}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {me.role === "admin" && members.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-white">👥 Sınıf üyeleri ({members.length})</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg bg-slate-800/40 px-3 py-2">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                  style={{ background: m.color }}
                >
                  {m.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-semibold text-slate-100">
                    {m.name} {m.role === "admin" && <span className="text-[10px] text-amber-300">· başkan</span>}
                  </div>
                  <div className="truncate text-[10px] text-slate-500">{m.email}</div>
                </div>
                
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
