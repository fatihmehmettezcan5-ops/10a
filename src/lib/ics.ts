import type { EventItem } from "@/lib/client";

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function stamp(date: string, time?: string | null): string {
  const d = date.replace(/-/g, "");
  return time ? `${d}T${time.replace(":", "")}00` : d;
}

/** Etkinlik listesinden indirilebilir bir .ics (iCalendar) metni üretir. */
export function buildIcs(events: EventItem[], calendarName: string): string {
  const now = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sinif Paneli//Takvim//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
  ];

  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:panel-event-${e.id}@sinif-paneli`,
      `DTSTAMP:${now}`,
    );
    if (e.time) {
      lines.push(`DTSTART:${stamp(e.date, e.time)}`, "DURATION:PT1H");
    } else {
      lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`, "DURATION:P1D");
    }
    lines.push(
      `SUMMARY:${escapeIcs(e.title)}`,
      `DESCRIPTION:${escapeIcs(e.description || "")}`,
      `CATEGORIES:${escapeIcs(e.scope === "class" ? "Sınıf" : "Kişisel")}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
