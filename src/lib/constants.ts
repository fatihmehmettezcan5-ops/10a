export const CLASS_NAME = process.env.NEXT_PUBLIC_CLASS_NAME ?? "10/A";

export const HOMEWORK_STATUSES = [
  "open",
  "in_progress",
  "done",
  "postponed",
  "cancelled",
] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];

export const STATUS_LABELS: Record<HomeworkStatus, string> = {
  open: "Yapılacak",
  in_progress: "Yapılıyor",
  done: "Bitti",
  postponed: "Ertelendi",
  cancelled: "İptal edildi",
};

export const STATUS_STYLES: Record<HomeworkStatus, string> = {
  open: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  in_progress: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  postponed: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  cancelled: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export const PRIORITIES = ["low", "normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Düşük",
  normal: "Normal",
  high: "Acil",
};

export const EVENT_TYPES = ["reminder", "exam", "activity", "deadline"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  reminder: "Hatırlatma",
  exam: "Sınav",
  activity: "Etkinlik",
  deadline: "Son tarih",
};
export const EVENT_TYPE_EMOJI: Record<EventType, string> = {
  reminder: "🔔",
  exam: "📝",
  activity: "🎒",
  deadline: "⏰",
};

export const DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];

export const SUBJECTS = [
  "Matematik",
  "Fizik",
  "Kimya",
  "Biyoloji",
  "Türk Dili ve Edebiyatı",
  "Tarih",
  "Coğrafya",
  "İngilizce",
  "Felsefe",
  "Din Kültürü",
  "Beden Eğitimi",
  "Bilişim",
  "Genel",
];

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Europe/Istanbul";

export function todayISO(): string {
  // Sunucu (Netlify fonksiyonları) UTC'de çalışır; gece 00:00-03:00 arasında
  // "dün" hesaplamamak için tarih hep Türkiye saatine göre alınır.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(new Date());
}

export function formatDateTR(iso?: string | null): string {
  if (!iso) return "Tarih yok";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "short",
    timeZone: "UTC",
  });
}

export function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const today = todayISO();
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
