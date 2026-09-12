import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";
import { CLASS_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/panel");

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 px-5 py-10 lg:flex-row lg:items-center">
      <section className="w-full max-w-xl space-y-6 fade-up">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-200">
          🎓 {CLASS_NAME} Sınıf Paneli
        </div>
        <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl">
          Sınıfın için gereken{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-sky-400 bg-clip-text text-transparent">
            her şey tek yerde
          </span>
        </h1>
        <p className="text-slate-300">
          Ödevleri birlikte takip edin, durumlarını güncelleyin, sınıf ve kişisel hatırlatıcılar kurun,
          güncel ders programını görün, sohbet edin ve ödev asistanına sorun.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            ["📚", "Ödev takibi", "Biri ekler, diğeri durumu günceller: bitti, ertelendi, iptal."],
            ["🗓️", "Çift takvim", "Sınıf takvimi herkese açık, kişisel takvim sadece sana."],
            ["⏰", "Ders programı", "Haftalık program, herkes güncelleyebilir."],
            ["💬", "Sınıf sohbeti", "Ödevleri konuşmak için ortak grup."],
            ["🤖", "Ödev asistanı", "Sorular sorar, ödev/takvim/program değiştirir."],
            ["🔐", "Güvenli kayıt", "Sınıf kodu + scrypt ile şifrelenmiş parola."],
          ].map(([icon, title, desc]) => (
            <li key={title} className="card p-4">
              <div className="text-lg">{icon}</div>
              <div className="mt-1 font-semibold text-white">{title}</div>
              <div className="text-xs text-slate-400">{desc}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="w-full max-w-md fade-up">
        <AuthForm />
      </section>
    </main>
  );
}
