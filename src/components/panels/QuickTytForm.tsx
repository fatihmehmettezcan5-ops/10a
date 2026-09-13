"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { TYT_SECTIONS, todayISO } from "@/lib/constants";

type Counts = { d: string; y: string; b: string };
const EMPTY: Counts = { d: "", y: "", b: "" };

function toNet(c: Counts): number {
  const d = Number(c.d || 0);
  const y = Number(c.y || 0);
  return Math.round((d - y / 4) * 100) / 100;
}

function hasAny(c: Counts): boolean {
  return c.d !== "" || c.y !== "" || c.b !== "";
}

/** Tek formda tüm TYT bölümleri: TDE + SOS(Tarih/Coğ/Din/Felsefe*) + MAT + FEN. */
export default function QuickTytForm({
  onSave,
  notify,
}: {
  onSave: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const [examName, setExamName] = useState("");
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, Counts>>({});
  const [felsefe, setFelsefe] = useState(false);
  const [saving, setSaving] = useState(false);

  const visibleSubjects = useMemo(
    () =>
      TYT_SECTIONS.flatMap((section) =>
        section.subjects.filter((x) => !x.optional || (x.name === "Felsefe" && felsefe)),
      ),
    [felsefe],
  );

  const totalNet = useMemo(
    () =>
      Math.round(
        visibleSubjects.reduce((sum, x) => sum + (hasAny(values[x.name] ?? EMPTY) ? toNet(values[x.name]) : 0), 0) * 100,
      ) / 100,
    [values, visibleSubjects],
  );

  const filled = visibleSubjects.filter((x) => hasAny(values[x.name] ?? EMPTY)).length;

  function set(subject: string, field: keyof Counts, value: string) {
    setValues((prev) => ({
      ...prev,
      [subject]: { ...EMPTY, ...(prev[subject] ?? {}), [field]: value.replace(/[^0-9]/g, "").slice(0, 3) },
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (filled === 0) {
      notify("En az bir derse sonuç gir.");
      return;
    }
    setSaving(true);
    try {
      const rows = visibleSubjects
        .filter((x) => hasAny(values[x.name] ?? EMPTY))
        .map((x) => {
          const c = values[x.name] ?? EMPTY;
          return { subject: x.name, correct: c.d, wrong: c.y, empty: c.b };
        });
      const data = await api<{ count: number; totalNet: number }>("/api/exams/batch", {
        method: "POST",
        body: JSON.stringify({ examName, date, rows }),
      });
      setValues({});
      setExamName("");
      await onSave();
      notify(`${data.count} ders kaydedildi · toplam ${data.totalNet} net 📊`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Deneme adı</label>
          <input
            className="input"
            value={examName}
            onChange={(e) => setExamName(e.target.value)}
            placeholder="örn. 3D TYT Deneme 5"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Tarih</label>
          <input className="input w-36" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={felsefe}
          onChange={(e) => setFelsefe(e.target.checked)}
          className="h-3.5 w-3.5 accent-indigo-500"
        />
        Bu denemede Felsefe soruları vardı (opsiyonel)
      </label>

      <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
        {TYT_SECTIONS.map((section) => (
          <div key={section.id} className="rounded-xl border border-slate-800 p-2.5">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{section.label}</div>
            <div className="space-y-1.5">
              {section.subjects.map((x) => {
                if (x.optional && !(x.name === "Felsefe" && felsefe)) return null;
                const c = values[x.name] ?? EMPTY;
                return (
                  <div key={x.name} className="grid grid-cols-[1fr_84px_46px] items-center gap-1.5">
                    <div className="text-xs font-semibold text-slate-200">
                      {x.name} <span className="text-[10px] font-normal text-slate-500">({x.questions} soru)</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(["d", "y", "b"] as const).map((f) => (
                        <input
                          key={f}
                          className="input px-1 py-1 text-center text-xs"
                          inputMode="numeric"
                          placeholder="0"
                          title={f === "d" ? "Doğru" : f === "y" ? "Yanlış" : "Boş"}
                          value={c[f]}
                          onChange={(e) => set(x.name, f, e.target.value)}
                        />
                      ))}
                    </div>
                    <div className="text-right text-xs font-bold text-indigo-300">
                      {hasAny(c) ? toNet(c) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
        <div className="text-xs text-slate-300">
          <span className="font-semibold text-white">{totalNet}</span> toplam net · {filled} ders
        </div>
        <button className="btn btn-primary" disabled={saving || examName.trim().length < 2 || filled === 0}>
          {saving ? "..." : "Denemeyi Kaydet"}
        </button>
      </div>
      <p className="text-center text-[10px] text-slate-500">
        Boş bıraktığın dersler kaydedilmez. Net = doğru − yanlış/4.
      </p>
    </form>
  );
}
