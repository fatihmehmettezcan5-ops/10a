"use client";

import { useState } from "react";
import { api, type SlotItem } from "@/lib/client";
import { bellTimes, DAY_NAMES } from "@/lib/constants";

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function SchedulePanel({
  schedule,
  reload,
  notify,
}: {
  schedule: SlotItem[];
  reload: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const [editing, setEditing] = useState<{ day: number; period: number } | null>(null);
  const [subject, setSubject] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);

  const jsDay = new Date().getDay();
  const todayIndex = jsDay === 0 ? 7 : jsDay;

  function cell(day: number, period: number) {
    return schedule.find((s) => s.dayOfWeek === day && s.period === period);
  }

  function startEdit(day: number, period: number) {
    const slot = cell(day, period);
    setEditing({ day, period });
    setSubject(slot?.subject ?? "");
    setTeacher(slot?.teacher ?? "");
    setRoom(slot?.room ?? "");
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      await api("/api/schedule", {
        method: "PUT",
        body: JSON.stringify({
          dayOfWeek: editing.day,
          period: editing.period,
          subject,
          teacher,
          room,
        }),
      });
      setEditing(null);
      await reload();
      notify("Ders programı güncellendi ⏰");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Güncellenemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-lg font-bold text-white">⏰ Güncel Ders Programı</h1>
          <p className="text-xs text-slate-400">
            Bir hücreye tıklayarak dersi düzenle. Değişiklik anında herkes için güncellenir.
          </p>
        </div>
        {editing && (
          <span className="rounded-lg bg-indigo-500/15 px-3 py-1 text-xs text-indigo-200">
            Düzenleniyor: {DAY_NAMES[editing.day - 1]} {editing.period}. ders
          </span>
        )}
      </div>

      {editing && (
        <div className="card flex flex-wrap items-end gap-2 p-4 fade-up">
          <div className="min-w-44 flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-400">Ders (boş = saati sil)</label>
            <input
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Matematik"
              autoFocus
            />
          </div>
          <div className="min-w-36 flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-400">Öğretmen</label>
            <input className="input" value={teacher} onChange={(e) => setTeacher(e.target.value)} />
          </div>
          <div className="min-w-28">
            <label className="mb-1 block text-xs font-semibold text-slate-400">Derslik</label>
            <input className="input" value={room} onChange={(e) => setRoom(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "..." : "Kaydet"}
          </button>
          <button className="btn btn-ghost" onClick={() => setEditing(null)}>
            Vazgeç
          </button>
        </div>
      )}

      <div className="card overflow-x-auto p-3">
        <table className="w-full min-w-3xl border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-20 text-[10px] uppercase text-slate-500">Saat</th>
              {DAY_NAMES.map((day, index) => (
                <th
                  key={day}
                  className={`rounded-lg px-2 py-2 text-xs font-bold ${
                    index + 1 === todayIndex ? "bg-indigo-500/15 text-indigo-200" : "text-slate-300"
                  }`}
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((period) => {
              const [startTime, endTime] = bellTimes(1, period);
              return (
                <tr key={period}>
                  <td className="rounded-lg bg-slate-900/60 px-2 py-2 text-center align-middle">
                    <div className="text-xs font-bold text-slate-300">{period}.</div>
                    <div className="text-[9px] text-slate-500">{startTime}–{endTime}</div>
                  </td>
                  {DAY_NAMES.map((_, dayIndex) => {
                    const day = dayIndex + 1;
                    const slot = cell(day, period);
                    const isEditing = editing?.day === day && editing?.period === period;
                    return (
                      <td key={`${day}-${period}`} className="align-top">
                        <button
                          onClick={() => startEdit(day, period)}
                          className={`h-16 w-full rounded-lg border p-2 text-left transition ${
                            isEditing
                              ? "border-indigo-400 bg-indigo-500/20"
                              : slot
                                ? "border-slate-800 bg-slate-900/60 hover:border-indigo-500/50"
                                : "border-dashed border-slate-800 bg-slate-900/20 hover:border-slate-600"
                          }`}
                        >
                          <div className="truncate text-xs font-semibold text-slate-100">
                            {slot?.subject ?? "+"}
                          </div>
                          {slot?.teacher && (
                            <div className="truncate text-[10px] text-slate-400">{slot.teacher}</div>
                          )}
                          {slot?.room && <div className="truncate text-[10px] text-slate-500">{slot.room}</div>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
