import { db } from "@/db";
import {
  aiMemory,
  assistantMessages,
  assistantProjects,
  announcements,
  chatFiles,
  messageReads,
  events,
  homeworks,
  homeworkUpdates,
  messages,
  mockExams,
  scheduleSlots,
  users,
} from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { HttpError } from "@/lib/auth";
import { kindOf, type ChatAttachment } from "@/lib/attachments";

/** Başkan VE başkan yardımcısı: sınıf yönetimi yetkileri. */
const isStaff = (role: string) => role === "admin" || role === "moderator";
import {
  HOMEWORK_STATUSES,
  PRIORITIES,
  EVENT_TYPES,
  todayISO,
  bellTimes,
  TYT_SUBJECTS,
  AYT_SUBJECTS,
  VC_ORDER,
} from "@/lib/constants";

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
  await rollRecurringHomeworks();
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

/** Haftalık tekrarlayan ödevleri bugüne ilerletir (idempotent). */
async function rollRecurringHomeworks() {
  const today = todayISO();
  const rows = await db
    .select()
    .from(homeworks)
    .where(and(eq(homeworks.recur, "weekly"), lt(homeworks.dueDate, today)));
  for (const hw of rows) {
    if (hw.status === "cancelled") continue;
    let due = hw.dueDate ?? today;
    while (due < today) {
      const d = new Date(`${due}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 7);
      due = d.toISOString().slice(0, 10);
    }
    await db
      .update(homeworks)
      .set({ dueDate: due, status: "open" })
      .where(eq(homeworks.id, hw.id));
    await db.insert(homeworkUpdates).values({
      homeworkId: hw.id,
      userId: null,
      fromStatus: hw.status,
      toStatus: "open",
      note: "🔁 Haftalık tekrar: otomatik yenilendi.",
      newDueDate: due,
    });
  }
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
      recur: input.recur === "weekly" ? "weekly" : null,
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
  if (hw.createdBy !== user.id && !isStaff(user.role)) {
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
  if (ev.scope === "personal" && ev.ownerId !== userId && !isStaff(role)) {
    throw new HttpError(403, "Bu hatırlatıcıyı değiştiremezsin.");
  }
  const [updated] = await db.update(events).set({ done }).where(eq(events.id, eventId)).returning();
  return updated;
}

export async function deleteEvent(eventId: number, userId: number, role: string) {
  const rows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  const ev = rows[0];
  if (!ev) throw new HttpError(404, "Hatırlatıcı bulunamadı.");
  if (ev.ownerId !== userId && !isStaff(role)) {
    throw new HttpError(403, "Bu hatırlatıcıyı sadece ekleyen kişi silebilir.");
  }
  await db.delete(events).where(eq(events.id, eventId));
  return { id: eventId };
}

/* ----------------------------- DERS PROGRAMI ------------------------------ */

const DEFAULT_PROGRAM: string[][] = [
  ["Matematik", "Matematik", "Türk Dili ve Edebiyatı", "Fizik", "İngilizce", "Din Kültürü", "Rehberlik", "Etüt"],
  ["Kimya", "Kimya", "Matematik", "Matematik", "Tarih", "Tarih", "Beden Eğitimi", "Etüt"],
  ["Türk Dili ve Edebiyatı", "Türk Dili ve Edebiyatı", "Biyoloji", "Biyoloji", "Coğrafya", "İngilizce", "Bilişim", "Etüt"],
  ["Fizik", "Fizik", "Matematik", "İngilizce", "Felsefe", "Felsefe", "Görsel Sanatlar", "Etüt"],
  ["Matematik", "Türk Dili ve Edebiyatı", "Kimya", "Coğrafya", "Biyoloji", "Beden Eğitimi", "Rehberlik", "Etüt"],
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
        startTime: bellTimes(dayIndex + 1, periodIndex + 1)[0],
        endTime: bellTimes(dayIndex + 1, periodIndex + 1)[1],
      })),
    );
    await db.insert(scheduleSlots).values(seed).onConflictDoNothing();
    rows = await db.select().from(scheduleSlots).orderBy(asc(scheduleSlots.dayOfWeek), asc(scheduleSlots.period));
  } else {
    // Zil çizelgesi değişirse (ör. okul saati güncellenir) eski kayıtlar otomatik düzeltilir.
    const stale = rows.filter((r) => {
      const [start, end] = bellTimes(r.dayOfWeek, r.period);
      return (start && r.startTime !== start) || (end && r.endTime !== end);
    });
    if (stale.length) {
      await Promise.all(
        stale.map((r) => {
          const [start, end] = bellTimes(r.dayOfWeek, r.period);
          return db
            .update(scheduleSlots)
            .set({ startTime: start, endTime: end })
            .where(eq(scheduleSlots.id, r.id));
        }),
      );
      rows = await db
        .select()
        .from(scheduleSlots)
        .orderBy(asc(scheduleSlots.dayOfWeek), asc(scheduleSlots.period));
    }
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
  const [startTime, endTime] = bellTimes(dayOfWeek, period);

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
      startTime,
      endTime,
    })
    .onConflictDoUpdate({
      target: [scheduleSlots.dayOfWeek, scheduleSlots.period],
      set: {
        subject,
        teacher: text(input.teacher),
        room: text(input.room),
        startTime,
        endTime,
        updatedAt: new Date(),
      },
    })
    .returning();
  return saved;
}

/* --------------------------------- SOHBET --------------------------------- */

export type ChatMessageRow = {
  id: number;
  userId: number | null;
  authorName: string;
  authorColor: string;
  authorRole: string;
  body: string;
  homeworkId: number | null;
  attachments: ChatAttachment[];
  mentions: number[];
  deletedForAll: boolean;
  edited: boolean;
  replyTo: { id: number; authorName: string; body: string; deletedForAll: boolean } | null;
  reads: { userId: number; name: string; readAt: string }[];
  createdAt: string;
};

export async function listMessages(
  afterId = 0,
  limit = 120,
  viewerId?: number,
  includeReads = false,
): Promise<ChatMessageRow[]> {
  const rows = await db
    .select({ message: messages, authorColor: users.color, authorRole: users.role })
    .from(messages)
    .leftJoin(users, eq(messages.userId, users.id))
    .where(afterId > 0 ? sql`${messages.id} > ${afterId}` : sql`true`)
    .orderBy(desc(messages.id))
    .limit(limit);

  const visible = rows.filter((r) => {
    if (viewerId) {
      const hiddenFor = (r.message.deletedFor ?? []) as unknown[];
      if (hiddenFor.includes(viewerId)) return false;
    }
    return true;
  });

  // Görülme kayıtları (yalnızca talep edilirse; son 120 mesajın okunmaları)
  let readRows: { messageId: number; userId: number; name: string; readAt: Date }[] = [];
  if (includeReads && visible.length) {
    const ids = visible.map((r) => r.message.id);
    readRows = await db
      .select({ messageId: messageReads.messageId, userId: messageReads.userId, name: users.name, readAt: messageReads.readAt })
      .from(messageReads)
      .innerJoin(users, eq(messageReads.userId, users.id))
      .where(inArray(messageReads.messageId, ids));
  }
  const readsByMessage = new Map<number, { userId: number; name: string; readAt: string }[]>();
  for (const r of readRows) {
    const list = readsByMessage.get(r.messageId) ?? [];
    list.push({ userId: r.userId, name: r.name, readAt: r.readAt.toISOString() });
    readsByMessage.set(r.messageId, list);
  }

  // Cevap verilen mesajlar (pencere dışındakiler dahil) tek sorguda çekilir.
  const replyIds = Array.from(
    new Set(visible.map((r) => r.message.replyToId).filter((v): v is number => typeof v === "number" && v > 0)),
  );
  const replyMap = new Map<number, { id: number; authorName: string; body: string; deletedForAll: boolean }>();
  if (replyIds.length) {
    const replyRows = await db
      .select({ id: messages.id, authorName: messages.authorName, body: messages.body, deletedForAll: messages.deletedForAll })
      .from(messages)
      .where(inArray(messages.id, replyIds));
    for (const r of replyRows) {
      replyMap.set(r.id, { id: r.id, authorName: r.authorName, body: r.body.slice(0, 220), deletedForAll: r.deletedForAll });
    }
  }

  return visible
    .map((r) => ({
      id: r.message.id,
      userId: r.message.userId,
      authorName: r.message.authorName,
      authorColor: r.authorColor ?? (r.message.userId ? "#94a3b8" : "#10b981"),
      authorRole: r.message.userId ? (r.authorRole ?? "student") : "ai",
      body: r.message.deletedForAll ? "" : r.message.body,
      homeworkId: r.message.homeworkId,
      attachments: r.message.deletedForAll ? [] : ((r.message.attachments ?? []) as ChatAttachment[]),
      mentions: (r.message.mentions ?? []) as number[],
      deletedForAll: r.message.deletedForAll,
      edited: r.message.edited,
      replyTo: r.message.replyToId ? replyMap.get(r.message.replyToId) ?? null : null,
      reads: readsByMessage.get(r.message.id) ?? [],
      createdAt: r.message.createdAt.toISOString(),
    }))
    .reverse();
}

/** Kimliği doğrulanmış kullanıcının okumadığı son mesajları "gördü" olarak işaretler. */
export async function markMessagesRead(viewerId: number) {
  const unread = await db
    .select({ id: messages.id })
    .from(messages)
    .leftJoin(messageReads, and(eq(messageReads.messageId, messages.id), eq(messageReads.userId, viewerId)))
    .where(and(sql`${messageReads.id} is null`, sql`${messages.userId} is distinct from ${viewerId}`))
    .limit(200);
  if (!unread.length) return 0;
  await db.insert(messageReads).values(unread.map((u) => ({ messageId: u.id, userId: viewerId })));
  return unread.length;
}

/** Kendi mesajını herkes için siler. Başkan herkesin mesajını silebilir. */
export async function deleteMessageForAll(user: { id: number; role: string }, messageId: number) {
  const [row] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!row) throw new HttpError(404, "Mesaj bulunamadı.");
  const own = row.userId === user.id;
  if (!own && !isStaff(user.role))
    throw new HttpError(403, "Yalnızca kendi mesajını silersin; başkalarının mesajını yöneticiler silebilir.");
  await db.update(messages).set({ deletedForAll: true }).where(eq(messages.id, messageId));
  return true;
}

/** Yalnız kendisi için siler: mesaj ona bir daha gösterilmez. */
export async function deleteMessageForMe(viewerId: number, messageId: number) {
  const [row] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!row) throw new HttpError(404, "Mesaj bulunamadı.");
  const hidden = (row.deletedFor ?? []) as unknown[];
  if (!hidden.includes(viewerId)) {
    hidden.push(viewerId);
    await db.update(messages).set({ deletedFor: hidden }).where(eq(messages.id, messageId));
  }
  return true;
}

/** Kendi mesajını düzenler (15 dk penceresi istemcide kontrol edilir). */
export async function editMessage(userId: number, messageId: number, body: string) {
  const clean = body.trim();
  if (!clean) throw new HttpError(400, "Boş mesaj olamaz.");
  if (clean.length > 1200) throw new HttpError(400, "Mesaj çok uzun (en fazla 1200 karakter).");
  const [row] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!row) throw new HttpError(404, "Mesaj bulunamadı.");
  if (row.userId !== userId) throw new HttpError(403, "Yalnızca kendi mesajını düzenleyebilirsin.");
  if (row.deletedForAll) throw new HttpError(400, "Silinmiş mesaj düzenlenemez.");
  await db.update(messages).set({ body: clean, edited: true }).where(eq(messages.id, messageId));
  return true;
}

export async function createMessage(
  user: { id: number; name: string },
  body: string,
  homeworkId?: number | null,
  attachments: ChatAttachment[] = [],
  mentions: number[] = [],
  replyToId?: number | null,
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
      attachments,
      mentions,
      ...(replyToId ? { replyToId } : {}),
    })
    .returning();
  return created;
}

/** AI asistanın sınıf sohbetine yazdığı mesaj (kullanıcıya bağlı değil). */
export async function createAiMessage(body: string, attachments: ChatAttachment[] = []) {
  const content = body.trim().slice(0, 1200);
  if (!content) throw new HttpError(400, "Boş mesaj gönderemezsin.");
  const [created] = await db
    .insert(messages)
    .values({
      userId: null,
      authorName: "10A Asistan",
      body: content,
      attachments,
      mentions: [],
    })
    .returning();
  return created;
}

/* ------------------------------ DOSYALAR ------------------------------ */

export async function saveChatFile(input: {
  name: string;
  mime: string;
  size: number;
  dataBase64: string;
  uploaderId: number;
}): Promise<ChatAttachment> {
  const id = crypto.randomUUID();
  await db.insert(chatFiles).values({
    id,
    name: input.name.slice(0, 180),
    mime: input.mime || "application/octet-stream",
    size: input.size,
    data: input.dataBase64,
    uploaderId: input.uploaderId,
  });
  return {
    id,
    name: input.name.slice(0, 180),
    mime: input.mime || "application/octet-stream",
    size: input.size,
    kind: kindOf(input.mime),
    url: `/api/files/${id}`,
  };
}

export async function getChatMessage(id: number) {
  const [row] = await db.select({ id: messages.id }).from(messages).where(eq(messages.id, id)).limit(1);
  return row ?? null;
}

export async function getChatFile(id: string) {
  const [row] = await db.select().from(chatFiles).where(eq(chatFiles.id, id)).limit(1);
  return row ?? null;
}

/* ------------------------- ASİSTAN HAFIZASI --------------------------- */

export async function listMemory(userId: number, limit = 40) {
  const rows = await db
    .select()
    .from(aiMemory)
    .where(eq(aiMemory.userId, userId))
    .orderBy(desc(aiMemory.id))
    .limit(limit);
  return rows.reverse();
}

export async function addMemory(userId: number, content: string) {
  const clean = content.trim().slice(0, 300);
  if (clean.length < 4) return null;
  const existing = await listMemory(userId, 60);
  if (existing.some((m) => m.content.toLowerCase() === clean.toLowerCase())) return null;
  const [created] = await db.insert(aiMemory).values({ userId, content: clean }).returning();
  // Tavan: kullanıcı başına en fazla 60 kayıt; fazlaysa en eskileri sil.
  const count = existing.length + 1;
  if (count > 60 && existing.length) {
    await db.delete(aiMemory).where(
      and(eq(aiMemory.userId, userId), lte(aiMemory.id, existing[0].id)),
    );
  }
  return created;
}

export async function deleteMemory(userId: number, id: number) {
  await db.delete(aiMemory).where(and(eq(aiMemory.userId, userId), eq(aiMemory.id, id)));
}

/* ------------------------- ASİSTAN PROJELERİ -------------------------- */

export async function listProjects(userId: number) {
  return db
    .select()
    .from(assistantProjects)
    .where(eq(assistantProjects.userId, userId))
    .orderBy(desc(assistantProjects.id));
}

export async function createProject(userId: number, name: string, note: string) {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new HttpError(400, "Proje adı gerekli.");
  const [created] = await db
    .insert(assistantProjects)
    .values({ userId, name: clean, note: note.trim().slice(0, 500) })
    .returning();
  return created;
}

export async function deleteProject(userId: number, id: number) {
  await db
    .delete(assistantProjects)
    .where(and(eq(assistantProjects.userId, userId), eq(assistantProjects.id, id)));
}

export async function getProject(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(assistantProjects)
    .where(and(eq(assistantProjects.userId, userId), eq(assistantProjects.id, id)))
    .limit(1);
  return row ?? null;
}

/* -------------------------------- ASİSTAN --------------------------------- */

export async function listAssistantMessages(userId: number, limit = 40, projectId?: number | null) {
  // projectId === undefined: tümü; 0: Genel (projesiz); >0: o proje
  const scope =
    projectId === undefined
      ? eq(assistantMessages.userId, userId)
      : projectId === 0
        ? and(eq(assistantMessages.userId, userId), isNull(assistantMessages.projectId))
        : and(eq(assistantMessages.userId, userId), eq(assistantMessages.projectId, projectId as number));
  const rows = await db
    .select()
    .from(assistantMessages)
    .where(scope)
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
  projectId?: number | null,
) {
  const [created] = await db
    .insert(assistantMessages)
    .values({ userId, role, content, actions, ...(projectId !== undefined ? { projectId } : {}) })
    .returning();
  return created;
}

/** @pingleme için hafif üye dizini (tüm kimliği doğrulanmış kullanıcılar açabilir). */
export async function listDirectory() {
  const rows = await db
    .select({ id: users.id, name: users.name, color: users.color })
    .from(users)
    .orderBy(users.name);
  return rows;
}

/* ------------------------------ DENEMELER --------------------------------- */

export type MockExamItem = {
  id: number;
  examName: string;
  examType: string;
  subject: string;
  date: string;
  correct: number;
  wrong: number;
  empty: number;
  net: number;
  createdAt: string;
};

export async function listMockExams(userId: number): Promise<MockExamItem[]> {
  const rows = await db
    .select()
    .from(mockExams)
    .where(eq(mockExams.userId, userId))
    .orderBy(desc(mockExams.date), desc(mockExams.id));
  return rows.map((r) => ({
    id: r.id,
    examName: r.examName,
    examType: r.examType,
    subject: r.subject,
    date: r.date,
    correct: r.correct,
    wrong: r.wrong,
    empty: r.empty,
    net: Math.round((r.correct - r.wrong / 4) * 100) / 100,
    createdAt: r.createdAt.toISOString(),
  }));
}

function countField(value: unknown, label: string): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 500) {
    throw new HttpError(400, `${label} 0 ile 500 arasında bir sayı olmalı.`);
  }
  return n;
}

export async function createMockExam(userId: number, input: Record<string, unknown>) {
  const examName = text(input.examName);
  if (examName.length < 2) throw new HttpError(400, "Deneme adı en az 2 karakter olmalı.");
  const date = normalizeDate(input.date);
  if (!date) throw new HttpError(400, "Geçerli bir tarih seç (YYYY-AA-GG).");
  const examType = ["TYT", "AYT", "Ders"].includes(text(input.examType)) ? text(input.examType) : "TYT";
  const subject = text(input.subject) || "Genel";
  const correct = countField(input.correct, "Doğru sayısı");
  const wrong = countField(input.wrong, "Yanlış sayısı");
  const empty = countField(input.empty, "Boş sayısı");

  const [created] = await db
    .insert(mockExams)
    .values({ userId, examName, examType, subject, date, correct, wrong, empty })
    .returning();
  return { ...created, net: Math.round((created.correct - created.wrong / 4) * 100) / 100 };
}

/** Hızlı TYT girişi: tek istekte birden çok ders sonucu (aynı deneme adı + tarih). */
export async function createMockExamBatch(userId: number, input: Record<string, unknown>) {
  const examName = text(input.examName);
  if (examName.length < 2) throw new HttpError(400, "Deneme adı en az 2 karakter olmalı.");
  const date = normalizeDate(input.date);
  if (!date) throw new HttpError(400, "Geçerli bir tarih seç (YYYY-AA-GG).");

  const rawRows = Array.isArray(input.rows) ? input.rows : [];
  if (rawRows.length === 0) throw new HttpError(400, "En az bir ders sonucu gir.");
  if (rawRows.length > 12) throw new HttpError(400, "Bir denemede en fazla 12 ders satırı olabilir.");

  const examType = text(input.examType) === "AYT" ? "AYT" : "TYT";
  const allowedSubjects = (examType === "AYT" ? AYT_SUBJECTS : TYT_SUBJECTS) as readonly string[];

  const seen = new Set<string>();
  const values = rawRows.map((r) => {
    const row = r as Record<string, unknown>;
    const subject = text(row.subject);
    if (!allowedSubjects.includes(subject)) {
      throw new HttpError(400, `Geçersiz ders (${examType}): ${subject || "(boş)"}`);
    }
    if (seen.has(subject)) throw new HttpError(400, `${subject} satırı tekrar ediyor.`);
    seen.add(subject);
    return {
      userId,
      examName,
      examType,
      subject,
      date,
      correct: countField(row.correct, `(${subject}) Doğru`),
      wrong: countField(row.wrong, `(${subject}) Yanlış`),
      empty: countField(row.empty, `(${subject}) Boş`),
    };
  });

  const created = await db.insert(mockExams).values(values).returning();
  const totalNet = Math.round(created.reduce((sum, r) => sum + (r.correct - r.wrong / 4), 0) * 100) / 100;
  return { count: created.length, totalNet };
}

/** Düz satırları tek deneme kartlarına gruplar (ad + tarih bazlı). */
export function buildMockExamGroups(rows: MockExamItem[]): MockExamGroup[] {
  const map = new Map<string, MockExamGroup>();
  for (const r of rows) {
    const id = `${r.date}|${r.examName}`;
    let g = map.get(id);
    if (!g) {
      g = { id, examName: r.examName, date: r.date, totalNet: 0, rows: [] };
      map.set(id, g);
    }
    g.rows.push(r);
  }
  const order = new Map<string, number>(TYT_SUBJECTS.map((name, i) => [name, i] as const));
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.rows.sort(
      (a, b) =>
        (order.get(a.subject) ?? 99) - (order.get(b.subject) ?? 99) ||
        a.subject.localeCompare(b.subject, "tr"),
    );
    g.totalNet = Math.round(g.rows.reduce((sum, r) => sum + r.net, 0) * 100) / 100;
  }
  return groups.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export type MockExamGroup = {
  id: string; // "tarih|denemeAdi"
  examName: string;
  date: string;
  totalNet: number;
  rows: MockExamItem[];
};

/** Tüm denemeyi (aynı ad + tarihteki tüm ders satırları) siler. */
export async function deleteMockExamGroup(id: string, userId: number, role: string) {
  const sep = id.indexOf("|");
  if (sep < 0) throw new HttpError(400, "Geçersiz deneme kimliği.");
  const date = normalizeDate(id.slice(0, sep));
  const examName = text(id.slice(sep + 1));
  if (!date || examName.length < 2) throw new HttpError(400, "Geçersiz deneme kimliği.");
  const filters = [eq(mockExams.date, date), eq(mockExams.examName, examName)];
  if (!isStaff(role)) filters.push(eq(mockExams.userId, userId));
  const deleted = await db
    .delete(mockExams)
    .where(and(...filters))
    .returning({ id: mockExams.id });
  if (deleted.length === 0) throw new HttpError(404, "Deneme bulunamadı.");
  return { count: deleted.length };
}

export async function deleteMockExam(id: number, userId: number, role: string) {
  const rows = await db.select().from(mockExams).where(eq(mockExams.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(404, "Deneme kaydı bulunamadı.");
  if (row.userId !== userId && !isStaff(role)) {
    throw new HttpError(403, "Bu kaydı sadece sahibi silebilir.");
  }
  await db.delete(mockExams).where(eq(mockExams.id, id));
  return { id };
}

/* ------------------------------ DUYURULAR --------------------------------- */

export async function listAnnouncements(limit = 10) {
  const rows = await db
    .select({ item: announcements, authorName: users.name, authorColor: users.color })
    .from(announcements)
    .leftJoin(users, eq(announcements.authorId, users.id))
    .orderBy(desc(announcements.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.item.id,
    title: r.item.title,
    body: r.item.body,
    authorId: r.item.authorId,
    authorName: r.authorName ?? "Bilinmeyen",
    authorColor: r.authorColor ?? "#94a3b8",
    createdAt: r.item.createdAt.toISOString(),
  }));
}

export async function createAnnouncement(authorId: number, input: Record<string, unknown>) {
  const title = text(input.title);
  if (title.length < 2 || title.length > 120) {
    throw new HttpError(400, "Duyuru başlığı 2-120 karakter olmalı.");
  }
  const body = text(input.body);
  if (body.length > 2000) throw new HttpError(400, "Duyuru metni en fazla 2000 karakter olabilir.");
  const [created] = await db
    .insert(announcements)
    .values({ authorId, title, body })
    .returning();
  return created;
}

export async function deleteAnnouncement(id: number, userId: number, role: string) {
  const rows = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(404, "Duyuru bulunamadı.");
  if (row.authorId !== userId && !isStaff(role)) {
    throw new HttpError(403, "Bu duyuruyu sadece yayınlayan veya sınıf başkanı silebilir.");
  }
  await db.delete(announcements).where(eq(announcements.id, id));
  return { id };
}

/** Yönetim: üye listesi (yalnız başkan). */
export async function listMembers() {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      color: users.color,
      vc: users.vc,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.id));
  return rows
    .map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
    .sort(
      (a, b) =>
        (VC_ORDER[a.vc ?? ""] ?? 99) - (VC_ORDER[b.vc ?? ""] ?? 99) ||
        a.name.localeCompare(b.name, "tr"),
    );
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
