import { db } from "@/db";
import {
  assistantMessages,
  events,
  homeworks,
  homeworkUpdates,
  messages,
  scheduleSlots,
  users,
} from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { HttpError } from "@/lib/auth";
import { HOMEWORK_STATUSES, PRIORITIES, EVENT_TYPES, todayISO } from "@/lib/constants";

export type HomeworkWithMeta = {
  id: number;
  title: string;
  subject: string;
  description: string;
  dueDate: string | null;
  status: string;
  priority: string;
  createdBy: number;
  createdByName: string;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
  history: {
    id: number;
    toStatus: string;
    fromStatus: string | null;
    note: string;
    newDueDate: string | null;
    userName: string | null;
    createdAt: string;
  }[];
};

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

/* --------------------------------- ÖDEVLER -------------------------------- */

export async function listHomeworks(): Promise<HomeworkWithMeta[]> {
  const creator = users;
  const rows = await db
    .select({
      hw: homeworks,
      creatorName: creator.name,
    })
    .from(homeworks)
    .leftJoin(creator, eq(homeworks.createdBy, creator.id))
    .orderBy(desc(homeworks.updatedAt));

  const ids = rows.map((r) => r.hw.id);
  const history = ids.length
    ? await db
        .select({
          update: homeworkUpdates,
          userName: users.name,
        })
        .from(homeworkUpdates)
        .leftJoin(users, eq(homeworkUpdates.userId, users.id))
        .where(inArray(homeworkUpdates.homeworkId, ids))
        .orderBy(desc(homeworkUpdates.createdAt))
    : [];

  const updaterIds = rows.map((r) => r.hw.updatedBy).filter((v): v is number => typeof v === "number");
  const updaters = updaterIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, updaterIds))
    : [];
  const updaterMap = new Map(updaters.map((u) => [u.id, u.name]));

  return rows.map((row) => ({
    id: row.hw.id,
    title: row.hw.title,
    subject: row.hw.subject,
    description: row.hw.description,
    dueDate: row.hw.dueDate,
    status: row.hw.status,
    priority: row.hw.priority,
    createdBy: row.hw.createdBy,
    createdByName: row.creatorName ?? "Bilinmeyen",
    updatedByName: row.hw.updatedBy ? updaterMap.get(row.hw.updatedBy) ?? null : null,
    createdAt: row.hw.createdAt.toISOString(),
    updatedAt: row.hw.updatedAt.toISOString(),
    history: history
      .filter((h) => h.update.homeworkId === row.hw.id)
      .map((h) => ({
        id: h.update.id,
        toStatus: h.update.toStatus,
        fromStatus: h.update.fromStatus,
        note: h.update.note,
        newDueDate: h.update.newDueDate,
        userName: h.userName,
        createdAt: h.update.createdAt.toISOString(),
      })),
  }));
}

export async function createHomework(userId: number, input: Record<string, unknown>) {
  const title = text(input.title);
  if (title.length < 2) throw new HttpError(400, "Ödev başlığı en az 2 karakter olmalı.");
  const priority = PRIORITIES.includes(text(input.priority) as never)
    ? (text(input.priority) as string)
    : "normal";

  const [created] = await db
    .insert(homeworks)
    .values({
      title,
      subject: text(input.subject, "Genel") || "Genel",
      description: text(input.description),
      dueDate: normalizeDate(input.dueDate),
      priority,
      status: "open",
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  await db.insert(homeworkUpdates).values({
    homeworkId: created.id,
    userId,
    fromStatus: null,
    toStatus: "open",
    note: "Ödev oluşturuldu.",
    newDueDate: created.dueDate,
  });

  return created;
}

export async function updateHomeworkStatus(
  userId: number,
  homeworkId: number,
  input: Record<string, unknown>,
) {
  const rows = await db.select().from(homeworks).where(eq(homeworks.id, homeworkId)).limit(1);
  const hw = rows[0];
  if (!hw) throw new HttpError(404, "Ödev bulunamadı.");

  const status = text(input.status);
  if (!HOMEWORK_STATUSES.includes(status as never)) {
    throw new HttpError(400, "Geçersiz durum değeri.");
  }
  const newDueDate = normalizeDate(input.newDueDate);
  const note = text(input.note);

  const [updated] = await db
    .update(homeworks)
    .set({
      status,
      dueDate: status === "postponed" && newDueDate ? newDueDate : newDueDate ?? hw.dueDate,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(homeworks.id, homeworkId))
    .returning();

  await db.insert(homeworkUpdates).values({
    homeworkId,
    userId,
    fromStatus: hw.status,
    toStatus: status,
    note,
    newDueDate,
  });

  return updated;
}

export async function editHomework(homeworkId: number, userId: number, input: Record<string, unknown>) {
  const rows = await db.select().from(homeworks).where(eq(homeworks.id, homeworkId)).limit(1);
  if (!rows[0]) throw new HttpError(404, "Ödev bulunamadı.");
  const patch: Record<string, unknown> = { updatedBy: userId, updatedAt: new Date() };
  if (typeof input.title === "string" && input.title.trim().length >= 2) patch.title = input.title.trim();
  if (typeof input.subject === "string" && input.subject.trim()) patch.subject = input.subject.trim();
  if (typeof input.description === "string") patch.description = input.description.trim();
  if (typeof input.priority === "string" && PRIORITIES.includes(input.priority as never)) {
    patch.priority = input.priority;
  }
  const due = normalizeDate(input.dueDate);
  if (due) patch.dueDate = due;

  const [updated] = await db.update(homeworks).set(patch).where(eq(homeworks.id, homeworkId)).returning();
  return updated;
}

export async function deleteHomework(homeworkId: number, user: { id: number; role: string }) {
  const rows = await db.select().from(homeworks).where(eq(homeworks.id, homeworkId)).limit(1);
  const hw = rows[0];
  if (!hw) throw new HttpError(404, "Ödev bulunamadı.");
  if (hw.createdBy !== user.id && user.role !== "admin") {
    throw new HttpError(403, "Bu ödevi sadece ekleyen kişi veya sınıf başkanı silebilir.");
  }
  await db.delete(homeworks).where(eq(homeworks.id, homeworkId));
  return { id: homeworkId };
}

export async function findHomeworkByTitle(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const rows = await db
    .select()
    .from(homeworks)
    .where(sql`lower(${homeworks.title}) like ${"%" + q + "%"} or lower(${homeworks.subject}) like ${"%" + q + "%"}`)
    .orderBy(desc(homeworks.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

/* -------------------------------- TAKVİM ---------------------------------- */

export async function listEvents(userId: number) {
  const rows = await db
    .select({ event: events, ownerName: users.name })
    .from(events)
    .leftJoin(users, eq(events.ownerId, users.id))
    .where(or(eq(events.scope, "class"), eq(events.ownerId, userId)))
    .orderBy(asc(events.date), asc(events.time));

  return rows.map((r) => ({
    id: r.event.id,
    title: r.event.title,
    description: r.event.description,
    date: r.event.date,
    time: r.event.time,
    scope: r.event.scope,
    type: r.event.type,
    done: r.event.done,
    ownerId: r.event.ownerId,
    ownerName: r.ownerName ?? "Bilinmeyen",
  }));
}

export async function createEvent(userId: number, input: Record<string, unknown>) {
  const title = text(input.title);
  if (title.length < 2) throw new HttpError(400, "Hatırlatıcı başlığı çok kısa.");
  const date = normalizeDate(input.date);
  if (!date) throw new HttpError(400, "Geçerli bir tarih seç (YYYY-AA-GG).");
  const scope = text(input.scope) === "personal" ? "personal" : "class";
  const type = EVENT_TYPES.includes(text(input.type) as never) ? text(input.type) : "reminder";

  const [created] = await db
    .insert(events)
    .values({
      title,
      description: text(input.description),
      date,
      time: normalizeTime(input.time),
      scope,
      type,
      ownerId: userId,
    })
    .returning();
  return created;
}

export async function toggleEvent(eventId: number, userId: number, role: string, done: boolean) {
  const rows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  const ev = rows[0];
  if (!ev) throw new HttpError(404, "Hatırlatıcı bulunamadı.");
  if (ev.scope === "personal" && ev.ownerId !== userId && role !== "admin") {
    throw new HttpError(403, "Bu hatırlatıcıyı değiştiremezsin.");
  }
  const [updated] = await db.update(events).set({ done }).where(eq(events.id, eventId)).returning();
  return updated;
}

export async function deleteEvent(eventId: number, userId: number, role: string) {
  const rows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  const ev = rows[0];
  if (!ev) throw new HttpError(404, "Hatırlatıcı bulunamadı.");
  if (ev.ownerId !== userId && role !== "admin") {
    throw new HttpError(403, "Bu hatırlatıcıyı sadece ekleyen kişi silebilir.");
  }
  await db.delete(events).where(eq(events.id, eventId));
  return { id: eventId };
}

/* ----------------------------- DERS PROGRAMI ------------------------------ */

const DEFAULT_TIMES = [
  ["08:40", "09:20"],
  ["09:30", "10:10"],
  ["10:20", "11:00"],
  ["11:10", "11:50"],
  ["12:40", "13:20"],
  ["13:30", "14:10"],
  ["14:20", "15:00"],
  ["15:10", "15:50"],
];

const DEFAULT_PROGRAM: string[][] = [
  ["Matematik", "Matematik", "Türk Dili ve Edebiyatı", "Fizik", "İngilizce", "Din Kültürü", "Rehberlik"],
  ["Kimya", "Kimya", "Matematik", "Matematik", "Tarih", "Tarih", "Beden Eğitimi"],
  ["Türk Dili ve Edebiyatı", "Türk Dili ve Edebiyatı", "Biyoloji", "Biyoloji", "Coğrafya", "İngilizce", "Bilişim"],
  ["Fizik", "Fizik", "Matematik", "İngilizce", "Felsefe", "Felsefe", "Görsel Sanatlar"],
  ["Matematik", "Türk Dili ve Edebiyatı", "Kimya", "Coğrafya", "Biyoloji", "Beden Eğitimi", "Rehberlik"],
];

export async function getSchedule() {
  let rows = await db.select().from(scheduleSlots).orderBy(asc(scheduleSlots.dayOfWeek), asc(scheduleSlots.period));
  if (rows.length === 0) {
    const seed = DEFAULT_PROGRAM.flatMap((day, dayIndex) =>
      day.map((subject, periodIndex) => ({
        dayOfWeek: dayIndex + 1,
        period: periodIndex + 1,
        subject,
        teacher: "",
        room: "10/A",
        startTime: DEFAULT_TIMES[periodIndex][0],
        endTime: DEFAULT_TIMES[periodIndex][1],
      })),
    );
    await db.insert(scheduleSlots).values(seed).onConflictDoNothing();
    rows = await db.select().from(scheduleSlots).orderBy(asc(scheduleSlots.dayOfWeek), asc(scheduleSlots.period));
  }
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function upsertScheduleSlot(input: Record<string, unknown>) {
  const dayOfWeek = Number(input.dayOfWeek);
  const period = Number(input.period);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 5) {
    throw new HttpError(400, "Gün 1 (Pazartesi) ile 5 (Cuma) arasında olmalı.");
  }
  if (!Number.isInteger(period) || period < 1 || period > 8) {
    throw new HttpError(400, "Ders saati 1 ile 8 arasında olmalı.");
  }
  const subject = text(input.subject);
  const times = DEFAULT_TIMES[period - 1] ?? ["", ""];

  if (!subject) {
    await db
      .delete(scheduleSlots)
      .where(and(eq(scheduleSlots.dayOfWeek, dayOfWeek), eq(scheduleSlots.period, period)));
    return { dayOfWeek, period, subject: "" };
  }

  const [saved] = await db
    .insert(scheduleSlots)
    .values({
      dayOfWeek,
      period,
      subject,
      teacher: text(input.teacher),
      room: text(input.room),
      startTime: text(input.startTime, times[0]) || times[0],
      endTime: text(input.endTime, times[1]) || times[1],
    })
    .onConflictDoUpdate({
      target: [scheduleSlots.dayOfWeek, scheduleSlots.period],
      set: {
        subject,
        teacher: text(input.teacher),
        room: text(input.room),
        updatedAt: new Date(),
      },
    })
    .returning();
  return saved;
}

/* --------------------------------- SOHBET --------------------------------- */

export async function listMessages(afterId = 0, limit = 120) {
  const rows = await db
    .select({ message: messages, authorColor: users.color, authorRole: users.role })
    .from(messages)
    .leftJoin(users, eq(messages.userId, users.id))
    .where(afterId > 0 ? sql`${messages.id} > ${afterId}` : sql`true`)
    .orderBy(desc(messages.id))
    .limit(limit);

  return rows
    .map((r) => ({
      id: r.message.id,
      userId: r.message.userId,
      authorName: r.message.authorName,
      authorColor: r.authorColor ?? "#94a3b8",
      authorRole: r.authorRole ?? "student",
      body: r.message.body,
      homeworkId: r.message.homeworkId,
      createdAt: r.message.createdAt.toISOString(),
    }))
    .reverse();
}

export async function createMessage(
  user: { id: number; name: string },
  body: string,
  homeworkId?: number | null,
) {
  const content = body.trim();
  if (!content) throw new HttpError(400, "Boş mesaj gönderemezsin.");
  if (content.length > 1200) throw new HttpError(400, "Mesaj çok uzun (en fazla 1200 karakter).");
  const [created] = await db
    .insert(messages)
    .values({
      userId: user.id,
      authorName: user.name,
      body: content,
      homeworkId: homeworkId ?? null,
    })
    .returning();
  return created;
}

/* -------------------------------- ASİSTAN --------------------------------- */

export async function listAssistantMessages(userId: number, limit = 40) {
  const rows = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.userId, userId))
    .orderBy(desc(assistantMessages.id))
    .limit(limit);
  return rows
    .map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      actions: (r.actions ?? []) as unknown[],
      createdAt: r.createdAt.toISOString(),
    }))
    .reverse();
}

export async function saveAssistantMessage(
  userId: number,
  role: "user" | "assistant",
  content: string,
  actions: unknown[] = [],
) {
  const [created] = await db
    .insert(assistantMessages)
    .values({ userId, role, content, actions })
    .returning();
  return created;
}

/* -------------------------------- ÖZETLER --------------------------------- */

export async function getDashboardStats(userId: number) {
  const allHomeworks = await db.select().from(homeworks);
  const upcoming = await db
    .select()
    .from(events)
    .where(and(gte(events.date, todayISO()), or(eq(events.scope, "class"), eq(events.ownerId, userId))))
    .orderBy(asc(events.date))
    .limit(5);
  const [memberCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  const [messageCount] = await db.select({ count: sql<number>`count(*)::int` }).from(messages);

  return {
    total: allHomeworks.length,
    open: allHomeworks.filter((h) => h.status === "open" || h.status === "in_progress").length,
    done: allHomeworks.filter((h) => h.status === "done").length,
    overdue: allHomeworks.filter(
      (h) => h.dueDate && h.dueDate < todayISO() && !["done", "cancelled"].includes(h.status),
    ).length,
    upcoming: upcoming.map((e) => ({ id: e.id, title: e.title, date: e.date, scope: e.scope, type: e.type })),
    members: memberCount?.count ?? 0,
    messages: messageCount?.count ?? 0,
  };
}
