"use client";

import { useMemo, useState } from "react";
import { api, type ExamItem, type Me } from "@/lib/client";
import { formatDateTR, SUBJECTS, todayISO } from "@/lib/constants";

const EXAM_TYPES = ["TYT", "AYT", "Ders"] as const;

/** Net serisini çizgi grafiğe çeviren bağımlılıksız SVG bileşeni. */
function NetChart({ points }: { points: { label: string; net: number }[] }) {
  if (points.length === 0) return null;
  const W = 640;
  const H = 230;
  const PAD = { top: 16, right: 42, bottom: 30, left: 34 };
  const maxNet = Math.max(4, ...points.map((p) => p.net)) * 1.15;
  const stepX = points.length > 1 ? (W - PAD.left - PAD.right) / (points.length - 1) : 0;
  const x = (i: number) => PAD.left + i * stepX;
  const y = (net: number) => H - PAD.bottom - (net / maxNet) * (H - PAD.top - PAD.bottom);
  const line = points.map((p, i) => `${x(i)},${y(p.net)}`).join(" ");
  const last = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const delta = prev ? Math.round((last.net - prev.net) * 100) / 100 : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Net gelişim grafiği">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const v = Math.round(maxNet * f);
        return (
          <g key={f}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#1e293b" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(v) + 3} fill="#64748b" fontSize="9" textAnchor="end">
              {v}
            </text>
          </g>
        );
      })}
      <polyline points={line} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={`${p.label}-${i}`} cx={x(i)} cy={y(p.net)} r="3.5" fill="#c7d2fe">
          <title>{`${p.label}: ${p.net} net`}</title>
        </circle>
      ))}
      <text x={x(points.length - 1)} y={y(last.net) - 9} fill="#e0e7ff" fontSize="11" fontWeight="bold" textAnchor="end">
        {last.net} net{delta !== null ? (delta >= 0 ? " ▲" : " ▼") : ""}
      </text>
      {points.slice(-4).map((p, i) => (
        <text
          key={p.label}
          x={x(points.length - 4 + i)}
          y={H - 10}
          fill="#64748b"
          fontSize="8.5"
          textAnchor="middle"
        >
          {p.label.slice(5)}
        </text>
      ))}
    </svg>
  );
}

export default function ExamsPanel({
  me,
  exams,
  reload,
  notify,
}: {
  me: Me;
  exams: ExamItem[];
  reload: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const [examName, setExamName] = useState("");
  const [examType, setExamType] = useState<(typeof EXAM_TYPES)[number]>("TYT");
  const [subject, setSubject] = useState("Matematik");
  const [date, setDate] = useState(todayISO());
  const [correct, setCorrect] = useState("");
  const [wrong, setWrong] = useState("");
  const [empty, setEmpty] = useState("");
  const [chartSubject, setChartSubject] = useState<string>("Tümü");
  const [saving, setSaving] = useState(false);

  const liveNet =
    Math.round((Number(correct || 0) - Number(wrong || 0) / 4) * 100) / 100;

  const subjects = useMemo(
    () => ["Tümü", ...Array.from(new Set(exams.map((e) => e.subject))).sort((a, b) => a.localeCompare(b, "tr"))],
    [exams],
  );

  const chartPoints = useMemo(() => {
    const pool = chartSubject === "Tümü" ? exams : exams.filter((e) => e.subject === chartSubject);
    const byDate = new Map<string, number>();
    for (const e of pool) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.net);
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-20)
      .map(([label, net]) => ({ label, net: Math.round(net * 100) / 100 }));
  }, [exams, chartSubject]);

  const summary = useMemo(() => {
    const pool = chartSubject === "Tümü" ? exams : exams.filter((e) => e.subject === chartSubject);
    if (pool.length === 0) return null;
    const nets = pool.map((e) => e.net);
    return {
      count: pool.length,
      avg: Math.round((nets.reduce((a, b) => a + b, 0) / pool.length) * 100) / 100,
      best: Math.max(...nets),
      last: pool[0].net,
    };
  }, [exams, chartSubject]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/exams", {
        method: "POST",
        body: JSON.stringify({ examName, examType, subject, date, correct, wrong, empty }),
      });
      setExamName("");
      setCorrect("");
      setWrong("");
      setEmpty("");
      await reload();
      notify("Deneme sonucu kaydedildi 📊");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    try {
      await api(`/api/exams/${id}`, { method: "DELETE" });
      await reload();
      notify("Deneme kaydı silindi.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Silinemedi.");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-white">📊 Net Gelişimim</h1>
            <select
              className="input w-auto py-1 text-xs"
              value={chartSubject}
              onChange={(e) => setChartSubject(e.target.value)}
            >
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {chartPoints.length > 1 ? (
            <NetChart points={chartPoints} />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              Grafik için en az iki deneme sonucu ekle.
            </p>
          )}
          {summary && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <div className="rounded-lg bg-slate-900/60 p-2">
                <div className="text-slate-400">Deneme</div>
                <div className="text-base font-bold text-white">{summary.count}</div>
              </div>
              <div className="rounded-lg bg-slate-900/60 p-2">
                <div className="text-slate-400">Ortalama</div>
                <div className="text-base font-bold text-emerald-300">{summary.avg}</div>
              </div>
              <div className="rounded-lg bg-slate-900/60 p-2">
                <div className="text-slate-400">En iyi</div>
                <div className="text-base font-bold text-amber-300">{summary.best}</div>
              </div>
              <div className="rounded-lg bg-slate-900/60 p-2">
                <div className="text-slate-400">Son net</div>
                <div className="text-base font-bold text-indigo-300">{summary.last}</div>
              </div>
            </div>
          )}
        </div>

        <div className="card overflow-x-auto p-4">
          <h2 className="mb-2 text-sm font-bold text-white">Kayıtlarım</h2>
          {exams.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Henüz deneme sonucu eklemedin.</p>
          ) : (
            <table className="w-full min-w-xl text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-2 py-1.5">Tarih</th>
                  <th className="px-2 py-1.5">Deneme</th>
                  <th className="px-2 py-1.5">Ders</th>
                  <th className="px-2 py-1.5 text-center">D</th>
                  <th className="px-2 py-1.5 text-center">Y</th>
                  <th className="px-2 py-1.5 text-center">B</th>
                  <th className="px-2 py-1.5 text-center">Net</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => (
                  <tr key={e.id} className="border-t border-slate-800/70">
                    <td className="px-2 py-1.5 text-slate-400">{formatDateTR(e.date)}</td>
                    <td className="px-2 py-1.5 font-semibold text-slate-100">
                      {e.examName} <span className="text-[10px] text-slate-500">· {e.examType}</span>
                    </td>
                    <td className="px-2 py-1.5 text-slate-300">{e.subject}</td>
                    <td className="px-2 py-1.5 text-center text-emerald-300">{e.correct}</td>
                    <td className="px-2 py-1.5 text-center text-rose-300">{e.wrong}</td>
                    <td className="px-2 py-1.5 text-center text-slate-400">{e.empty}</td>
                    <td className="px-2 py-1.5 text-center font-bold text-indigo-300">{e.net}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onClick={() => remove(e.id)}
                        className="text-slate-600 transition hover:text-rose-400"
                        aria-label="Sil"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="card h-fit space-y-3 p-4">
        <h2 className="text-sm font-bold text-white">➕ Deneme Ekle</h2>
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
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Tür</label>
            <select
              className="input"
              value={examType}
              onChange={(e) => setExamType(e.target.value as (typeof EXAM_TYPES)[number])}
            >
              {EXAM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Ders</label>
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Tarih</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-emerald-400">Doğru</label>
            <input
              className="input"
              type="number"
              min={0}
              max={500}
              value={correct}
              onChange={(e) => setCorrect(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-rose-400">Yanlış</label>
            <input
              className="input"
              type="number"
              min={0}
              max={500}
              value={wrong}
              onChange={(e) => setWrong(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Boş</label>
            <input
              className="input"
              type="number"
              min={0}
              max={500}
              value={empty}
              onChange={(e) => setEmpty(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-center text-sm">
          <span className="text-slate-300">Net: </span>
          <span className="text-lg font-black text-indigo-200">{Number.isFinite(liveNet) ? liveNet : 0}</span>
          <span className="ml-1 text-[10px] text-slate-500">(doğru − yanlış/4)</span>
        </div>
        <button className="btn btn-primary w-full" disabled={saving || examName.trim().length < 2}>
          {saving ? "..." : "Kaydet"}
        </button>
        <p className="text-center text-[10px] text-slate-500">
          Sonuçlar yalnızca sana görünür; sınıf başkanı gerektiğinde silebilir.
        </p>
      </form>
    </div>
  );
}
