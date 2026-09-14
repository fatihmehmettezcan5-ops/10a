"use client";

import { useMemo, useState } from "react";
import { api, type EventItem, type HomeworkItem, type Me } from "@/lib/client";
import { buildIcs } from "@/lib/ics";
import {
  EVENT_TYPES,
  EVENT_TYPE_EMOJI,
  EVENT_TYPE_LABELS,
  formatDateTR,
  todayISO,
  type EventType,
} from "@/lib/constants";

const WEEK_HEADERS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function monthMatrix(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const startOffset = (first.getUTCDay() + 6) % 7; // Pazartesi = 0
  const days: (string | null)[] = Array.from({ length: startOffset }, () => null);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let d = 1; d <= daysInMonth; d += 1) {
    days.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

export default function CalendarPanel({
  me,
  events,
  homeworks,
  reload,
  notify,
}: {
  me: Me;
  events: EventItem[];
  homeworks: HomeworkItem[];
  reload: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(todayISO());
  const [scopeFilter, setScopeFilter] = useState<"all" | "class" | "personal">("all");

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [scope, setScope] = useState<"class" | "personal">("class");
  const [type, setType] = useState<EventType>("reminder");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const visible = useMemo(
    () => events.filter((e) => (scopeFilter === "all" ? true : e.scope === scopeFilter)),
    [events, scopeFilter],
  );

  const cells = useMemo(() => monthMatrix(year, month), [year, month]);
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const dayEvents = visible.filter((e) => e.date === selected);
  const dayHomeworks = homeworks.filter(
    (h) => h.dueDate === selected && h.status !== "cancelled",
  );

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(year, month + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth());
  }

  function exportIcs() {
    const ics = buildIcs(visible, "10/A Sınıf Takvimi");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "10a-takvim.ics";
    link.click();
    URL.revokeObjectURL(url);
    notify("Takvim .ics olarak indirildi 🗓️");
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/events", {
        method: "POST",
        body: JSON.stringify({ title, date, time: time || null, scope, type, description }),
      });
      setTitle("");
      setDescription("");
      setTime("");
      await reload();
      notify("Hatırlatıcı eklendi 🔔");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Eklenemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(event: EventItem) {
    try {
      await api(`/api/events/${event.id}`, {
        method: "PATCH",
        body: JSON.stringify({ done: !event.done }),
      });
      await reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Güncellenemedi.");
    }
  }

  async function remove(event: EventItem) {
    try {
      await api(`/api/events/${event.id}`, { method: "DELETE" });
      await reload();
      notify("Hatırlatıcı silindi.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Silinemedi.");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost px-2 py-1" onClick={exportIcs} title="Google/Apple Takvim için indir (.ics)">
              ⬇️ .ics
            </button>
            <button className="btn btn-ghost px-2 py-1" onClick={() => shiftMonth(-1)}>
              ←
            </button>
            <h2 className="min-w-40 text-center text-sm font-bold capitalize text-white">{monthLabel}</h2>
            <button className="btn btn-ghost px-2 py-1" onClick={() => shiftMonth(1)}>
              →
            </button>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-900/70 p-1 text-xs font-semibold">
            {(
              [
                ["all", "Hepsi"],
                ["class", "Sınıf"],
                ["personal", "Kişisel"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setScopeFilter(key)}
                className={`rounded-md px-2.5 py-1 transition ${
                  scopeFilter === key
                    ? "bg-amber-500 text-black"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-400">
          {WEEK_HEADERS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, index) => {
            if (!cell) return <div key={`empty-${index}`} className="h-16 rounded-lg bg-slate-900/20" />;
            const dayNumber = Number(cell.slice(-2));
            const cellEvents = visible.filter((e) => e.date === cell);
            const cellDue = homeworks.filter((h) => h.dueDate === cell && h.status !== "cancelled");
            const isToday = cell === todayISO();
            const isSelected = cell === selected;
            return (
              <button
                key={cell}
                onClick={() => {
                  setSelected(cell);
                  setDate(cell);
                }}
                className={`h-16 rounded-lg border p-1 text-left transition ${
                  isSelected
                    ? "border-indigo-400/70 bg-indigo-500/15"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-600"
                }`}
              >
                <div
                  className={`text-[11px] font-bold ${
                    isToday ? "text-fuchsia-300" : isSelected ? "text-indigo-200" : "text-slate-400"
                  }`}
                >
                  {dayNumber}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {cellEvents.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className={`h-1.5 w-1.5 rounded-full ${
                        e.scope === "class" ? "bg-indigo-400" : "bg-emerald-400"
                      }`}
                    />
                  ))}
                  {cellDue.slice(0, 2).map((h) => (
                    <span key={h.id} className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  ))}
                </div>
                {cellEvents[0] && (
                  <div className="truncate text-[11px] text-slate-400">{cellEvents[0].title}</div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-indigo-400" /> Sınıf hatırlatıcısı
          </span>
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-emerald-400" /> Kişisel
          </span>
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-amber-400" /> Ödev teslimi
          </span>
        </div>
      </section>

      <div className="space-y-4">
        <section className="card p-4">
          <h2 className="text-sm font-bold text-white">{formatDateTR(selected)}</h2>
          {dayEvents.length === 0 && dayHomeworks.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Bu güne ait kayıt yok.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dayEvents.map((event) => (
                <li key={event.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div
                        className={`text-sm font-semibold ${
                          event.done ? "text-slate-400 line-through" : "text-slate-100"
                        }`}
                      >
                        {EVENT_TYPE_EMOJI[event.type as EventType] ?? "🔔"} {event.title}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {event.time ? `${event.time} · ` : ""}
                        {event.scope === "class" ? "Sınıf takvimi" : "Kişisel"} · {event.ownerName}
                      </div>
                      {event.description && (
                        <p className="mt-1 text-[11px] text-slate-400">{event.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => toggle(event)}
                        className="rounded-lg border border-slate-700 px-2 py-1 text-xs hover:border-emerald-500/50"
                        title="Tamamlandı"
                      >
                        {event.done ? "↩" : "✓"}
                      </button>
                      {(event.ownerId === me.id || me.role === "admin") && (
                        <button
                          onClick={() => remove(event)}
                          className="rounded-lg border border-slate-700 px-2 py-1 text-xs hover:border-rose-500/50"
                          title="Sil"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
              {dayHomeworks.map((hw) => (
                <li
                  key={`hw-${hw.id}`}
                  className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm"
                >
                  <div className="font-semibold text-amber-200">📚 Teslim: {hw.title}</div>
                  <div className="text-[11px] text-amber-200/70">{hw.subject}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form onSubmit={addEvent} className="card space-y-3 p-4">
          <h2 className="text-sm font-bold text-white">➕ Hatırlatıcı ekle</h2>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ör: Fizik yazılısı"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input"
              value={scope}
              onChange={(e) => setScope(e.target.value as "class" | "personal")}
            >
              <option value="class">Sınıf takvimi (herkese açık)</option>
              <option value="personal">Kişisel takvim (sadece ben)</option>
            </select>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as EventType)}>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="input min-h-16"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Açıklama (opsiyonel)"
          />
          <button className="btn btn-primary w-full" disabled={saving}>
            {saving ? "Kaydediliyor..." : "Takvime ekle"}
          </button>
        </form>
      </div>
    </div>
  );
}
