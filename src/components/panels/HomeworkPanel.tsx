"use client";

import { useMemo, useState } from "react";
import { api, type HomeworkItem, type Me } from "@/lib/client";
import {
  HOMEWORK_STATUSES,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
  SUBJECTS,
  daysUntil,
  formatDateTR,
  todayISO,
  type HomeworkStatus,
  type Priority,
} from "@/lib/constants";

export default function HomeworkPanel({
  me,
  homeworks,
  reload,
  notify,
  onDiscuss,
}: {
  me: Me;
  homeworks: HomeworkItem[];
  reload: () => Promise<void>;
  notify: (text: string) => void;
  onDiscuss: (hw: HomeworkItem) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Matematik");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [filter, setFilter] = useState<"all" | HomeworkStatus>("all");
  const [search, setSearch] = useState("");
  const [openHistory, setOpenHistory] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return homeworks.filter((hw) => {
      const statusOk = filter === "all" ? true : hw.status === filter;
      const searchOk =
        !q ||
        hw.title.toLocaleLowerCase("tr-TR").includes(q) ||
        hw.subject.toLocaleLowerCase("tr-TR").includes(q) ||
        hw.description.toLocaleLowerCase("tr-TR").includes(q);
      return statusOk && searchOk;
    });
  }, [homeworks, filter, search]);

  async function createHomework(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/homeworks", {
        method: "POST",
        body: JSON.stringify({ title, subject, dueDate: dueDate || null, priority, description }),
      });
      setTitle("");
      setDescription("");
      setDueDate("");
      setShowForm(false);
      await reload();
      notify("Ödev eklendi ✅");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Ödev eklenemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-lg font-bold text-white">📚 Ödev Takibi</h1>
          <p className="text-xs text-slate-400">
            Ödevi biri ekler, durumunu herkes güncelleyebilir. Tüm değişiklikler geçmişte tutulur.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Vazgeç" : "➕ Yeni ödev"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createHomework} className="card space-y-3 p-4 fade-up">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-400">Ödev başlığı</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ör: Matematik 142. sayfa 1-12 arası sorular"
                required
              />
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
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Teslim tarihi</label>
              <input
                className="input"
                type="date"
                value={dueDate}
                min={todayISO()}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Öncelik</label>
              <select
                className="input"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-400">Açıklama / kaynak</label>
              <textarea
                className="input min-h-20"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kitap, sayfa, teslim şekli, ek notlar..."
              />
            </div>
          </div>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Kaydediliyor..." : "Ödevi kaydet"}
          </button>
        </form>
      )}

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <input
          className="input max-w-xs flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Ödev ara..."
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              filter === "all"
                ? "border-indigo-400/50 bg-indigo-500/20 text-indigo-200"
                : "border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            Tümü ({homeworks.length})
          </button>
          {HOMEWORK_STATUSES.map((status) => {
            const count = homeworks.filter((h) => h.status === status).length;
            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  filter === status
                    ? STATUS_STYLES[status]
                    : "border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                {STATUS_LABELS[status]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-400">
          Bu filtrede ödev yok. Yeni bir ödev ekleyebilirsin.
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((hw) => (
            <HomeworkCard
              key={hw.id}
              hw={hw}
              me={me}
              reload={reload}
              notify={notify}
              onDiscuss={onDiscuss}
              historyOpen={openHistory === hw.id}
              toggleHistory={() => setOpenHistory(openHistory === hw.id ? null : hw.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HomeworkCard({
  hw,
  me,
  reload,
  notify,
  onDiscuss,
  historyOpen,
  toggleHistory,
}: {
  hw: HomeworkItem;
  me: Me;
  reload: () => Promise<void>;
  notify: (text: string) => void;
  onDiscuss: (hw: HomeworkItem) => void;
  historyOpen: boolean;
  toggleHistory: () => void;
}) {
  const [status, setStatus] = useState<HomeworkStatus>(hw.status as HomeworkStatus);
  const [note, setNote] = useState("");
  const [newDate, setNewDate] = useState(hw.dueDate ?? "");
  const [busy, setBusy] = useState(false);
  const left = daysUntil(hw.dueDate);
  const late = left !== null && left < 0 && hw.status !== "done" && hw.status !== "cancelled";

  async function save() {
    setBusy(true);
    try {
      await api(`/api/homeworks/${hw.id}/status`, {
        method: "POST",
        body: JSON.stringify({
          status,
          note,
          newDueDate: status === "postponed" ? newDate : null,
        }),
      });
      setNote("");
      await reload();
      notify(`Durum güncellendi: ${STATUS_LABELS[status]}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Güncellenemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`"${hw.title}" ödevini silmek istediğine emin misin?`)) return;
    try {
      await api(`/api/homeworks/${hw.id}`, { method: "DELETE" });
      await reload();
      notify("Ödev silindi.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Silinemedi.");
    }
  }

  return (
    <article className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
              #{hw.id} · {hw.subject}
            </span>
            {hw.priority === "high" && (
              <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
                ACİL
              </span>
            )}
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                STATUS_STYLES[hw.status as HomeworkStatus] ?? ""
              }`}
            >
              {STATUS_LABELS[hw.status as HomeworkStatus] ?? hw.status}
            </span>
          </div>
          <h3 className="mt-1.5 font-bold text-white">{hw.title}</h3>
          {hw.description && <p className="mt-1 text-xs text-slate-400">{hw.description}</p>}
        </div>
        {(hw.createdBy === me.id || me.role === "admin") && (
          <button
            onClick={remove}
            className="shrink-0 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 transition hover:border-rose-500/50 hover:text-rose-300"
            title="Ödevi sil"
          >
            🗑
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span className={late ? "font-semibold text-rose-300" : ""}>
          📅 {formatDateTR(hw.dueDate)}
          {left !== null &&
            ` (${left < 0 ? `${Math.abs(left)} gün gecikti` : left === 0 ? "bugün" : `${left} gün kaldı`})`}
        </span>
        <span>👤 Ekleyen: {hw.createdByName}</span>
        {hw.updatedByName && <span>✏️ Son güncelleyen: {hw.updatedByName}</span>}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <div className="mb-2 text-[11px] font-semibold text-slate-400">Durumu güncelle</div>
        <div className="flex flex-wrap gap-2">
          <select
            className="input max-w-40"
            value={status}
            onChange={(e) => setStatus(e.target.value as HomeworkStatus)}
          >
            {HOMEWORK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {status === "postponed" && (
            <input
              className="input max-w-44"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          )}
          <input
            className="input min-w-40 flex-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Not (opsiyonel): neden?"
          />
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "..." : "Kaydet"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={toggleHistory} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200">
          {historyOpen ? "Geçmişi gizle" : `Geçmiş (${hw.history.length})`}
        </button>
        <button onClick={() => onDiscuss(hw)} className="text-xs font-semibold text-slate-400 hover:text-slate-200">
          💬 Sohbette konuş
        </button>
      </div>

      {historyOpen && (
        <ul className="space-y-2 border-t border-slate-800 pt-3 fade-up">
          {hw.history.map((item) => (
            <li key={item.id} className="text-[11px] text-slate-400">
              <span className="text-slate-200">{item.userName ?? "Bilinmeyen"}</span>{" "}
              {item.fromStatus
                ? `${STATUS_LABELS[item.fromStatus as HomeworkStatus] ?? item.fromStatus} → `
                : ""}
              <span className="font-semibold text-indigo-300">
                {STATUS_LABELS[item.toStatus as HomeworkStatus] ?? item.toStatus}
              </span>
              {item.newDueDate && ` · yeni tarih ${item.newDueDate}`}
              {item.note && ` · “${item.note}”`}
              <span className="ml-1 text-slate-400">
                {new Date(item.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
