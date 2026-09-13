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

/** TYT denemesi bölümleri ve soru sayıları (yaklaşık; Felsefe opsiyoneldir). */
export const TYT_SECTIONS = [
  {
    id: "TDE",
    label: "Türkçe (TDE)",
    subjects: [{ name: "Türkçe", questions: 40, optional: false }],
  },
  {
    id: "SOS",
    label: "Sosyal (SOS)",
    subjects: [
      { name: "Tarih", questions: 5, optional: false },
      { name: "Coğrafya", questions: 5, optional: false },
      { name: "Din Kültürü", questions: 5, optional: false },
      { name: "Felsefe", questions: 5, optional: true },
    ],
  },
  {
    id: "MAT",
    label: "Matematik (MAT)",
    subjects: [{ name: "Matematik", questions: 40, optional: false }],
  },
  {
    id: "FEN",
    label: "Fen (FEN)",
    subjects: [
      { name: "Fizik", questions: 7, optional: false },
      { name: "Kimya", questions: 7, optional: false },
      { name: "Biyoloji", questions: 6, optional: false },
    ],
  },
] as const;

export const TYT_SUBJECTS = TYT_SECTIONS.flatMap((s) => s.subjects.map((x) => x.name));

/** Ders → bölüm eşlemesi (grafik filtreleri ve etiketler için). */
export const SUBJECT_SECTION: Record<string, string> = {
  "Türkçe": "TDE",
  "Türk Dili ve Edebiyatı": "TDE",
  "Tarih": "SOS",
  "Coğrafya": "SOS",
  "Din Kültürü": "SOS",
  "Felsefe": "SOS",
  "Matematik": "MAT",
  "Geometri": "MAT",
  "Fizik": "FEN",
  "Kimya": "FEN",
  "Biyoloji": "FEN",
};

export const SECTION_STYLES: Record<string, string> = {
  TDE: "bg-indigo-500/15 text-indigo-300",
  SOS: "bg-amber-500/15 text-amber-300",
  MAT: "bg-sky-500/15 text-sky-300",
  FEN: "bg-emerald-500/15 text-emerald-300",
};

export const DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];

/** Kayıt ve profil sayfasında kullanılan avatar renkleri. */
export const PROFILE_COLORS = [
  "#6366f1", "#ec4899", "#14b8a6", "#f59e0b",
  "#8b5cf6", "#22c55e", "#ef4444", "#0ea5e9",
] as const;

/**
 * Zil çizelgesi: 08:20 başlangıç, 40 dk ders + 10 dk teneffüs.
 * Öğle arası 12:20-13:10. Cuma günleri öğle arası 13:20'ye uzar ve
 * telafisi için öğleden sonra teneffüsler 5 dakikadır; yine 15:30'da bitiş.
 */
export const BELL_WEEKDAY: [string, string][] = [
  ["08:20", "09:00"],
  ["09:10", "09:50"],
  ["10:00", "10:40"],
  ["10:50", "11:30"],
  ["11:40", "12:20"],
  ["13:10", "13:50"],
  ["14:00", "14:40"],
  ["14:50", "15:30"],
];

export const BELL_FRIDAY: [string, string][] = [
  ["08:20", "09:00"],
  ["09:10", "09:50"],
  ["10:00", "10:40"],
  ["10:50", "11:30"],
  ["11:40", "12:20"],
  ["13:20", "14:00"],
  ["14:05", "14:45"],
  ["14:50", "15:30"],
];

/** Gün ve ders sırasına göre resmî zil saatleri (5 = Cuma). */
export function bellTimes(dayOfWeek: number, period: number): [string, string] {
  const table = dayOfWeek === 5 ? BELL_FRIDAY : BELL_WEEKDAY;
  return table[period - 1] ?? ["", ""];
}

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
