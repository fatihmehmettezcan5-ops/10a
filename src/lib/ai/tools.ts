import type { SafeUser } from "@/lib/auth";
import {
  createEvent,
  createHomework,
  createMessage,
  deleteEvent,
  deleteHomework,
  editHomework,
  findHomeworkByTitle,
  getSchedule,
  listEvents,
  listHomeworks,
  listMessages,
  toggleEvent,
  updateHomeworkStatus,
  upsertScheduleSlot,
} from "@/lib/data";
import { CLASS_NAME, DAY_NAMES, STATUS_LABELS, todayISO, type HomeworkStatus } from "@/lib/constants";

export type ActionResult = { type: string; ok: boolean; summary: string };

export const TOOL_GUIDE = `Kullanabileceğin eylemler (actions dizisi içinde JSON nesneleri):
- {"type":"create_homework","title":"...","subject":"Matematik","description":"...","dueDate":"YYYY-AA-GG","priority":"low|normal|high"}
- {"type":"update_homework_status","homeworkId":12,"status":"open|in_progress|done|postponed|cancelled","note":"...","newDueDate":"YYYY-AA-GG"}  (homeworkId bilinmiyorsa "match":"ödev başlığından parça" kullan)
- {"type":"edit_homework","homeworkId":12,"title":"...","subject":"...","description":"...","dueDate":"YYYY-AA-GG","priority":"high"}
- {"type":"delete_homework","homeworkId":12}
- {"type":"create_event","title":"...","date":"YYYY-AA-GG","time":"HH:MM","scope":"class|personal","eventType":"reminder|exam|activity|deadline","description":"..."}
- {"type":"complete_event","eventId":3,"done":true}
- {"type":"delete_event","eventId":3}
- {"type":"update_schedule","dayOfWeek":1,"period":3,"subject":"Fizik","teacher":"...","room":"..."}  (dayOfWeek 1=Pazartesi ... 5=Cuma, subject boş bırakılırsa o saat silinir)
- {"type":"send_message","body":"sınıf sohbetine gönderilecek mesaj"}
Kullanıcı bir değişiklik istemiyorsa actions boş dizi olmalı. Asla uydurma id kullanma; listede olmayan bir kayıt için "match" alanını kullan.`;

export async function buildContext(user: SafeUser) {
  const [homeworks, events, schedule, chat] = await Promise.all([
    listHomeworks(),
    listEvents(user.id),
    getSchedule(),
    listMessages(0, 15),
  ]);

  const today = todayISO();
  const weekday = new Date().toLocaleDateString("tr-TR", { weekday: "long" });

  const scheduleText = DAY_NAMES.map((day, index) => {
    const slots = schedule
      .filter((s) => s.dayOfWeek === index + 1)
      .sort((a, b) => a.period - b.period)
      .map((s) => `${s.period}.${s.subject}`)
      .join(", ");
    return `${day}: ${slots || "boş"}`;
  }).join("\n");

  const homeworkText = homeworks.length
    ? homeworks
        .map(
          (h) =>
            `#${h.id} | ${h.title} | ders: ${h.subject} | durum: ${
              STATUS_LABELS[h.status as HomeworkStatus] ?? h.status
            } | teslim: ${h.dueDate ?? "yok"} | ekleyen: ${h.createdByName}${
              h.description ? ` | not: ${h.description.slice(0, 160)}` : ""
            }`,
        )
        .join("\n")
    : "Kayıtlı ödev yok.";

  const eventText = events.length
    ? events
        .map(
          (e) =>
            `#${e.id} | ${e.date}${e.time ? " " + e.time : ""} | ${e.title} | ${
              e.scope === "class" ? "sınıf takvimi" : "kişisel"
            } | ${e.done ? "tamamlandı" : "bekliyor"}`,
        )
        .join("\n")
    : "Kayıtlı hatırlatıcı yok.";

  const chatText = chat.length
    ? chat.map((m) => `${m.authorName}: ${m.body.slice(0, 160)}`).join("\n")
    : "Sohbet boş.";

  return `BUGÜN: ${today} (${weekday})
SINIF: ${CLASS_NAME}
KULLANICI: ${user.name} (id ${user.id}, rol ${user.role})

ÖDEVLER:
${homeworkText}

TAKVİM (sınıf + kişisel):
${eventText}

HAFTALIK DERS PROGRAMI:
${scheduleText}

SON SINIF SOHBETİ:
${chatText}`;
}

async function resolveHomeworkId(action: Record<string, unknown>): Promise<number | null> {
  const direct = Number(action.homeworkId ?? action.id);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const match = typeof action.match === "string" ? action.match : typeof action.title === "string" ? action.title : "";
  if (!match) return null;
  const found = await findHomeworkByTitle(match);
  return found?.id ?? null;
}

export async function executeActions(
  user: SafeUser,
  actions: Record<string, unknown>[],
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const action of actions.slice(0, 6)) {
    const type = String(action.type ?? "");
    try {
      switch (type) {
        case "create_homework": {
          const created = await createHomework(user.id, action);
          results.push({
            type,
            ok: true,
            summary: `Ödev eklendi: “${created.title}” (${created.subject}${
              created.dueDate ? `, teslim ${created.dueDate}` : ""
            })`,
          });
          break;
        }
        case "update_homework_status": {
          const id = await resolveHomeworkId(action);
          if (!id) throw new Error("Ödev bulunamadı.");
          const updated = await updateHomeworkStatus(user.id, id, {
            status: action.status,
            note: action.note ?? `${user.name} asistan üzerinden güncelledi.`,
            newDueDate: action.newDueDate ?? action.dueDate,
          });
          results.push({
            type,
            ok: true,
            summary: `“${updated.title}” durumu: ${
              STATUS_LABELS[updated.status as HomeworkStatus] ?? updated.status
            }${updated.dueDate ? ` (teslim ${updated.dueDate})` : ""}`,
          });
          break;
        }
        case "edit_homework": {
          const id = await resolveHomeworkId(action);
          if (!id) throw new Error("Ödev bulunamadı.");
          const updated = await editHomework(id, user.id, action);
          results.push({ type, ok: true, summary: `Ödev güncellendi: “${updated.title}”` });
          break;
        }
        case "delete_homework": {
          const id = await resolveHomeworkId(action);
          if (!id) throw new Error("Ödev bulunamadı.");
          await deleteHomework(id, user);
          results.push({ type, ok: true, summary: `#${id} numaralı ödev silindi.` });
          break;
        }
        case "create_event": {
          const created = await createEvent(user.id, {
            ...action,
            type: action.eventType ?? action.calendarType ?? "reminder",
          });
          results.push({
            type,
            ok: true,
            summary: `Hatırlatıcı eklendi: “${created.title}” – ${created.date}${
              created.time ? " " + created.time : ""
            } (${created.scope === "class" ? "sınıf" : "kişisel"})`,
          });
          break;
        }
        case "complete_event": {
          const id = Number(action.eventId ?? action.id);
          const updated = await toggleEvent(id, user.id, user.role, action.done !== false);
          results.push({
            type,
            ok: true,
            summary: `“${updated.title}” ${updated.done ? "tamamlandı" : "bekliyor"} olarak işaretlendi.`,
          });
          break;
        }
        case "delete_event": {
          const id = Number(action.eventId ?? action.id);
          await deleteEvent(id, user.id, user.role);
          results.push({ type, ok: true, summary: `#${id} numaralı hatırlatıcı silindi.` });
          break;
        }
        case "update_schedule": {
          const saved = await upsertScheduleSlot(action);
          const dayName = DAY_NAMES[Number(saved.dayOfWeek) - 1] ?? "?";
          results.push({
            type,
            ok: true,
            summary: saved.subject
              ? `Ders programı güncellendi: ${dayName} ${saved.period}. ders → ${saved.subject}`
              : `Ders programından silindi: ${dayName} ${saved.period}. ders`,
          });
          break;
        }
        case "send_message": {
          const created = await createMessage(user, String(action.body ?? ""));
          results.push({ type, ok: true, summary: `Sınıf sohbetine gönderildi: “${created.body}”` });
          break;
        }
        default:
          results.push({ type: type || "bilinmeyen", ok: false, summary: "Bu eylem desteklenmiyor." });
      }
    } catch (error) {
      results.push({
        type: type || "bilinmeyen",
        ok: false,
        summary: error instanceof Error ? error.message : "Eylem uygulanamadı.",
      });
    }
  }

  return results;
}
