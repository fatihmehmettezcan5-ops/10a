import { DAY_NAMES, STATUS_LABELS, SUBJECTS, todayISO, type HomeworkStatus } from "@/lib/constants";

export type Snapshot = {
  homeworks: { id: number; title: string; subject: string; status: string; dueDate: string | null }[];
  events: { id: number; title: string; date: string; time: string | null; scope: string; done: boolean }[];
  schedule: { dayOfWeek: number; period: number; subject: string }[];
  userName: string;
};

/* Türkçe karakterleri ASCII'ye indirger; uzunluğu korur (indeks hizası için önemli). */
const FOLD_MAP: Record<string, string> = {
  ı: "i", İ: "i", I: "i", i: "i",
  ş: "s", Ş: "s",
  ğ: "g", Ğ: "g",
  ü: "u", Ü: "u",
  ö: "o", Ö: "o",
  ç: "c", Ç: "c",
  â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
};

export function fold(value: string): string {
  return Array.from(value)
    .map((ch) => FOLD_MAP[ch] ?? (ch.length === 1 ? ch.toLowerCase() : ch))
    .join("");
}

const MONTHS = [
  "ocak", "subat", "mart", "nisan", "mayis", "haziran",
  "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik",
];
const WEEKDAYS = ["pazar", "pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi"];

function shift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function parseTurkishDate(input: string): string | null {
  const text = fold(input);

  if (/\bbugun\b/.test(text)) return shift(0);
  if (/\byarin/.test(text)) return shift(1);
  if (/(obur gun|ertesi gun|yarindan sonra)/.test(text)) return shift(2);
  if (/(haftaya|gelecek hafta|bir hafta sonra)/.test(text)) return shift(7);

  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dotted = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    let year = dotted[3] ? Number(dotted[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const named = text.match(new RegExp(`(\\d{1,2})\\s+(${MONTHS.join("|")})`));
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS.indexOf(named[2]) + 1;
    const year = new Date().getFullYear();
    const pad = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const candidate = `${year}-${pad}`;
    return candidate < todayISO() ? `${year + 1}-${pad}` : candidate;
  }

  const inDays = text.match(/(\d{1,2})\s*gun\s*sonra/);
  if (inDays) return shift(Number(inDays[1]));

  for (let i = 0; i < WEEKDAYS.length; i += 1) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(text)) {
      const today = new Date().getDay();
      let diff = (i - today + 7) % 7;
      if (diff === 0) diff = 7;
      return shift(diff);
    }
  }
  return null;
}

function detectSubject(text: string): string | null {
  const t = fold(text);
  for (const subject of SUBJECTS) {
    const key = fold(subject).split(" ")[0];
    if (key.length > 3 && t.includes(key)) return subject;
  }
  if (/\bmat\b/.test(t)) return "Matematik";
  if (/(edebiyat|turkce)/.test(t)) return "Türk Dili ve Edebiyatı";
  if (/(ingilizce|english)/.test(t)) return "İngilizce";
  return null;
}

function matchHomework(text: string, snapshot: Snapshot) {
  const words = fold(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !["odev", "odevi", "odevini", "gorev"].includes(w));
  let best: { score: number; hw: Snapshot["homeworks"][number] } | null = null;
  const idMatch = text.match(/#(\d+)/);

  for (const hw of snapshot.homeworks) {
    const haystack = fold(`${hw.title} ${hw.subject}`);
    let score = 0;
    for (const word of words) {
      if (haystack.includes(word)) score += word.length;
    }
    if (idMatch && Number(idMatch[1]) === hw.id) score += 100;
    if (score > 0 && (!best || score > best.score)) best = { score, hw };
  }
  return best && best.score >= 3 ? best.hw : null;
}

/** Tetikleyici kelimeleri ve tarih eklerini temizleyerek başlık üretir. */
function cleanTitle(raw: string, triggers: string[], stripDates = true): string {
  let result = raw.trim();

  for (const trigger of triggers) {
    const folded = fold(result);
    const index = folded.indexOf(fold(trigger));
    if (index >= 0) {
      result = `${result.slice(0, index)} ${result.slice(index + trigger.length)}`;
    }
  }

  // "saat 15:00" gibi ifadelerdeki iki noktayı ayraç sanmamak için rakam kontrolü
  for (let i = 0; i < result.length && i < 60; i += 1) {
    if (result[i] !== ":") continue;
    const before = result[i - 1] ?? "";
    const after = result[i + 1] ?? "";
    if (!(/\d/.test(before) && /\d/.test(after))) {
      result = result.slice(i + 1);
      break;
    }
  }

  if (stripDates) {
    result = result
      .replace(/,?\s*(teslim|son tarih|bitis|bitiş)\s+[^,]*$/i, "")
      .replace(/\b\d{1,2}:\d{2}\b/g, " ")
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
      .replace(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/g, " ")
      .replace(
        /\b(bugun|bugün|yarin|yarın|haftaya|obur|öbür|pazartesi|sali|salı|carsamba|çarşamba|persembe|perşembe|cuma|cumartesi|pazar|gunu|günü|saat)\b/gi,
        " ",
      );
  }

  result = result
    .replace(/\b(lutfen|lütfen|hadi|bana|bize|bunu|sunu|şunu|olarak|ekler misin|eklermisin|olustur|oluştur)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();

  return result.length > 1 ? result.charAt(0).toLocaleUpperCase("tr-TR") + result.slice(1) : "";
}

function listOpenHomeworks(snapshot: Snapshot) {
  const open = snapshot.homeworks.filter((h) => h.status === "open" || h.status === "in_progress");
  if (!open.length) return "Şu an açık ödev görünmüyor 🎉";
  return open
    .map(
      (h) =>
        `• #${h.id} ${h.title} (${h.subject}) — ${
          STATUS_LABELS[h.status as HomeworkStatus] ?? h.status
        }${h.dueDate ? `, teslim ${h.dueDate}` : ""}`,
    )
    .join("\n");
}

function dayPlan(snapshot: Snapshot, date: string, label: string) {
  const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay();
  const dayIndex = jsDay === 0 ? 7 : jsDay;
  const lessons = snapshot.schedule
    .filter((s) => s.dayOfWeek === dayIndex)
    .sort((a, b) => a.period - b.period)
    .map((s) => `${s.period}. ${s.subject}`)
    .join(" · ");
  const events = snapshot.events.filter((e) => e.date === date);
  const due = snapshot.homeworks.filter(
    (h) => h.dueDate === date && h.status !== "done" && h.status !== "cancelled",
  );

  return [
    `📅 ${label} (${date})`,
    dayIndex <= 5 ? `Dersler: ${lessons || "kayıtlı ders yok"}` : "Hafta sonu, ders yok.",
    events.length
      ? `Hatırlatıcılar:\n${events
          .map((e) => `• ${e.time ? e.time + " " : ""}${e.title}${e.scope === "class" ? " (sınıf)" : ""}`)
          .join("\n")}`
      : "Hatırlatıcı yok.",
    due.length
      ? `Teslim edilecek ödevler:\n${due.map((h) => `• ${h.title} (${h.subject})`).join("\n")}`
      : "Bu güne teslim ödev yok.",
  ].join("\n");
}

/** Anahtar olmadığında (0 bütçe modunda) çalışan kural tabanlı Türkçe asistan. */
export function localAssistant(
  message: string,
  snapshot: Snapshot,
): { reply: string; actions: Record<string, unknown>[] } {
  const text = message.trim();
  const t = fold(text);
  const date = parseTurkishDate(text);

  /* --- Durum güncellemeleri --- */
  const statusIntent: HomeworkStatus | null = /(\bbitti\b|bitirdim|tamamladim|tamamlandi|yaptim|yaptik|bitirdik)/.test(t)
    ? "done"
    : /(ertele|uzat|sonraya|tehir)/.test(t)
      ? "postponed"
      : /(iptal|kaldirildi|verilmedi)/.test(t)
        ? "cancelled"
        : /(basladim|yapiyorum|devam ediyorum|ugrasiyorum)/.test(t)
          ? "in_progress"
          : null;

  if (statusIntent) {
    const hw = matchHomework(text, snapshot);
    if (hw) {
      return {
        reply: `“${hw.title}” ödevinin durumunu ${STATUS_LABELS[statusIntent]} olarak güncelliyorum.`,
        actions: [
          {
            type: "update_homework_status",
            homeworkId: hw.id,
            status: statusIntent,
            note: `${snapshot.userName}: ${text.slice(0, 180)}`,
            newDueDate: statusIntent === "postponed" ? date : null,
          },
        ],
      };
    }
    return {
      reply: `Hangi ödevi kastettiğini bulamadım. Açık ödevler:\n${listOpenHomeworks(
        snapshot,
      )}\n\nÖrnek: "#3 bitti" veya "matematik ödevi bitti".`,
      actions: [],
    };
  }

  /* --- Ödev ekleme --- */
  if (/(odev ekle|yeni odev|odev olustur|odev tanimla|odev gir|odev yaz|odev kaydet)/.test(t)) {
    const title = cleanTitle(text, [
      "odev ekle",
      "yeni odev",
      "odev olustur",
      "odev tanimla",
      "odev gir",
      "odev yaz",
      "odev kaydet",
    ]);
    if (!title) {
      return {
        reply: 'Ödevin adını da yazar mısın? Örnek: "ödev ekle: Matematik 142. sayfa, teslim cuma"',
        actions: [],
      };
    }
    const subject = detectSubject(text) ?? "Genel";
    return {
      reply: `“${title}” ödevini ${subject} dersine ekliyorum${date ? `, teslim tarihi ${date}` : ""}.`,
      actions: [
        {
          type: "create_homework",
          title,
          subject,
          dueDate: date,
          priority: /(acil|onemli|cok onemli)/.test(t) ? "high" : "normal",
          description: "",
        },
      ],
    };
  }

  /* --- Hatırlatıcı / takvim --- */
  if (/(hatirlat|takvime ekle|etkinlik ekle|sinav var|yazili var|not dus)/.test(t)) {
    const title = cleanTitle(text, [
      "hatirlatici ekle",
      "hatirlatici",
      "hatirlat",
      "takvime ekle",
      "etkinlik ekle",
      "not dus",
      "bana",
      "sinifa",
    ]);
    if (!date) {
      return {
        reply:
          'Tarihi anlayamadım. Örnek: "yarın 14:00 kütüphane buluşmasını hatırlat" ya da "12.04 fizik yazılısını takvime ekle".',
        actions: [],
      };
    }
    const time = text.match(/(\d{1,2}):(\d{2})/);
    const isClass = /(sinif|herkes|hepimiz|grup|sinav|yazili)/.test(t);
    return {
      reply: `${date} tarihine “${title || "Hatırlatıcı"}” ekliyorum (${
        isClass ? "sınıf takvimi" : "kişisel takvim"
      }).`,
      actions: [
        {
          type: "create_event",
          title: title || "Hatırlatıcı",
          date,
          time: time ? `${time[1].padStart(2, "0")}:${time[2]}` : null,
          scope: isClass ? "class" : "personal",
          eventType: /(sinav|yazili)/.test(t) ? "exam" : /(teslim|son tarih)/.test(t) ? "deadline" : "reminder",
        },
      ],
    };
  }

  /* --- Sınıf sohbetine mesaj --- */
  if (/(sohbete (yaz|gonder)|gruba (yaz|gonder)|sinifa duyur|duyuru yap|sohbete mesaj)/.test(t)) {
    const body = cleanTitle(
      text,
      ["sohbete yaz", "sohbete gonder", "sohbete mesaj", "gruba yaz", "gruba gonder", "sinifa duyur", "duyuru yap"],
      false,
    );
    if (!body) return { reply: "Ne yazmamı istiyorsun? Mesajı iki nokta üst üsteden sonra yazabilirsin.", actions: [] };
    return { reply: "Mesajı sınıf sohbetine gönderiyorum.", actions: [{ type: "send_message", body }] };
  }

  /* --- Ders programı --- */
  if (/(ders program|programda|hangi ders|dersler ne|program nasil)/.test(t)) {
    const dayIndex = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
    if (dayIndex >= 1 && dayIndex <= 5) {
      const lessons = snapshot.schedule
        .filter((s) => s.dayOfWeek === dayIndex)
        .sort((a, b) => a.period - b.period)
        .map((s) => `${s.period}. ${s.subject}`)
        .join("\n");
      return { reply: `${DAY_NAMES[dayIndex - 1]} dersleri:\n${lessons || "kayıt yok"}`, actions: [] };
    }
    const all = DAY_NAMES.map((day, i) => {
      const lessons = snapshot.schedule
        .filter((s) => s.dayOfWeek === i + 1)
        .sort((a, b) => a.period - b.period)
        .map((s) => s.subject)
        .join(", ");
      return `${day}: ${lessons || "-"}`;
    }).join("\n");
    return { reply: `Haftalık ders programı:\n${all}`, actions: [] };
  }

  /* --- Gün planı --- */
  if (/(bugun ne|bugunku|gunun plani|program ne|bugun nelerim)/.test(t)) {
    return { reply: dayPlan(snapshot, todayISO(), "Bugün"), actions: [] };
  }
  if (/(yarin ne|yarinki|yarin nelerim)/.test(t)) {
    return { reply: dayPlan(snapshot, shift(1), "Yarın"), actions: [] };
  }

  /* --- Ödev listesi --- */
  if (/(odev|yapilacak|durum|liste|neler var|kalan|gecik)/.test(t)) {
    const overdue = snapshot.homeworks.filter(
      (h) => h.dueDate && h.dueDate < todayISO() && h.status !== "done" && h.status !== "cancelled",
    );
    return {
      reply: `Açık ödevler:\n${listOpenHomeworks(snapshot)}${
        overdue.length
          ? `\n\n⚠️ Süresi geçmiş: ${overdue.map((h) => `${h.title} (${h.dueDate})`).join(", ")}`
          : ""
      }`,
      actions: [],
    };
  }

  /* --- Takvim sorgusu --- */
  if (/(sinav|yazili|takvim|hatirlatici|etkinlik)/.test(t)) {
    const upcoming = snapshot.events.filter((e) => e.date >= todayISO()).slice(0, 8);
    return {
      reply: upcoming.length
        ? `Yaklaşan takvim kayıtları:\n${upcoming
            .map(
              (e) =>
                `• ${e.date}${e.time ? " " + e.time : ""} — ${e.title} (${
                  e.scope === "class" ? "sınıf" : "kişisel"
                })`,
            )
            .join("\n")}`
        : "Takvimde yaklaşan bir kayıt yok.",
      actions: [],
    };
  }

  return {
    reply: `Merhaba ${snapshot.userName}! Şu an anahtarsız yerleşik moddayım ama şunları yapabilirim:
• "ödev ekle: Fizik 3. ünite testi, teslim cuma"
• "#4 bitti" / "matematik ödevini cumaya ertele" / "kimya ödevi iptal"
• "yarın 15:00 veli toplantısını sınıfa hatırlat"
• "bugün ne var", "salı ders programı", "ödevler", "yaklaşan sınavlar"
• "sohbete yaz: yarın kütüphanede buluşalım"

Daha doğal sohbet için sunucuya ücretsiz bir API anahtarı (OPENROUTER_API_KEY / GEMINI_API_KEY / GROQ_API_KEY) eklemen yeterli.`,
    actions: [],
  };
}
