"use client";

import type { EventItem, HomeworkItem, Me, SlotItem, Stats } from "@/lib/client";
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
  onGo,
}: {
  me: Me;
  stats: Stats | null;
  homeworks: HomeworkItem[];
  events: EventItem[];
  schedule: SlotItem[];
  onGo: (tab: TabId) => void;
}) {
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
      <div className="card bg-gradient-to-br from-indigo-500/15 to-transparent p-5">
        <h1 className="text-2xl font-black text-white">
          Merhaba {me.name.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Bugün {formatDateTR(today)}. {todayLessons.length > 0 ? `${todayLessons.length} ders var.` : "Bugün ders kaydı yok."}{" "}
          {stats && stats.overdue > 0 ? `${stats.overdue} ödevin süresi geçmiş!` : "Her şey yolunda görünüyor."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => onGo("homework")}>
            ➕ Ödev ekle
          </button>
          <button className="btn btn-ghost" onClick={() => onGo("calendar")}>
            🗓️ Hatırlatıcı kur
          </button>
          <button className="btn btn-ghost" onClick={() => onGo("assistant")}>
            🤖 Asistana sor
          </button>
        </div>
      </div>

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
    </div>
  );
}
