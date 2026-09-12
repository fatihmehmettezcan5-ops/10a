"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, type Me } from "@/lib/client";

type Mode = "login" | "register";

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState("10A");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = mode === "login" ? { email, password } : { name, email, password, joinCode };
      await api<{ user: Me }>(path, { method: "POST", body: JSON.stringify(payload) });
      router.replace("/panel");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6 shadow-2xl">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-900/70 p-1 text-sm font-semibold">
        {(["login", "register"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`rounded-lg px-3 py-2 transition ${
              mode === m ? "bg-indigo-500 text-white shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {m === "login" ? "Giriş yap" : "Kayıt ol"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Ad Soyad</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Zeynep Yılmaz"
              required
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">E-posta</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ogrenci@okul.com"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Şifre</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="En az 8 karakter, harf + rakam"
            required
            minLength={8}
          />
        </div>

        {mode === "register" && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Sınıf katılım kodu</label>
            <input
              className="input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="10A"
              required
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Varsayılan kod <span className="font-mono text-slate-300">10A</span>. Sunucuda{" "}
              <span className="font-mono">CLASS_JOIN_CODE</span> ile değiştirebilirsin. İlk kayıt olan kişi
              sınıf başkanı (admin) olur.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Bekle..." : mode === "login" ? "Giriş yap" : "Hesap oluştur"}
        </button>
      </form>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
        Şifreler scrypt + rastgele tuz ile saklanır, oturum HMAC imzalı httpOnly çerezde tutulur.
      </p>
    </div>
  );
}
