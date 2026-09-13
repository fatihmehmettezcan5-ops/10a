"use client";

import { useState } from "react";
import { api, type Me } from "@/lib/client";
import { PROFILE_COLORS, VC_OPTIONS } from "@/lib/constants";

export default function ProfileModal({
  me,
  onSaved,
  onClose,
  notify,
}: {
  me: Me;
  onSaved: (user: Me) => void;
  onClose: () => void;
  notify: (text: string) => void;
}) {
  const [name, setName] = useState(me.name);
  const [color, setColor] = useState(me.color);
  const [vc, setVc] = useState<string>(me.vc ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const data = await api<{ user: Me }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name, color, vc }),
      });
      onSaved(data.user);
      notify("Profil güncellendi ✨");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Profil güncellenemedi.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== newPassword2) {
      notify("Yeni şifreler birbiriyle uyuşmuyor.");
      return;
    }
    setSavingPassword(true);
    try {
      await api("/api/profile/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
      notify("Şifren güncellendi 🔐");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Şifre değiştirilemedi.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card max-h-[90vh] w-full max-w-md space-y-5 overflow-y-auto p-5 fade-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Profil ayarları"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">👤 Profilim</h2>
          <button className="btn btn-ghost px-2" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        <form onSubmit={saveProfile} className="space-y-3">
          <div className="flex items-center gap-3">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-bold text-white"
              style={{ background: color }}
            >
              {name.slice(0, 1).toLocaleUpperCase("tr-TR")}
            </span>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-slate-400">Ad Soyad</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">VC grubu</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setVc("")}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                  vc === ""
                    ? "border-indigo-400 bg-indigo-500/20 text-white"
                    : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                Yok
              </button>
              {VC_OPTIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVc(v)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    vc === v
                      ? v.startsWith("E")
                        ? "border-sky-400 bg-sky-500/20 text-white"
                        : "border-pink-400 bg-pink-500/20 text-white"
                      : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">E = erkek grubu, K = kız grubu. Emin değilsen boş bırak.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Avatar rengi</label>
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Renk ${c}`}
                  className={`h-8 w-8 rounded-lg transition ${
                    color === c ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900" : "opacity-70 hover:opacity-100"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <button className="btn btn-primary w-full" disabled={savingProfile}>
            {savingProfile ? "..." : "Bilgilerimi Kaydet"}
          </button>
        </form>

        <div className="border-t border-slate-800 pt-4">
          <form onSubmit={savePassword} className="space-y-3">
            <h3 className="text-sm font-bold text-white">🔐 Şifre Değiştir</h3>
            <input
              className="input"
              type="password"
              placeholder="Mevcut şifren"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <input
              className="input"
              type="password"
              placeholder="Yeni şifre (en az 8 karakter, harf + rakam)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <input
              className="input"
              type="password"
              placeholder="Yeni şifre (tekrar)"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              required
              autoComplete="new-password"
            />
            <button className="btn btn-ghost w-full" disabled={savingPassword}>
              {savingPassword ? "..." : "Şifremi Güncelle"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
