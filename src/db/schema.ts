import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("student"), // student | admin
    color: text("color").notNull().default("#6366f1"),
    vc: text("vc"), // VC grubu: E1-E3 (erkek), K1-K3 (kiz), null = atanmadi
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const homeworks = pgTable(
  "homeworks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    subject: text("subject").notNull().default("Genel"),
    description: text("description").notNull().default(""),
    dueDate: text("due_date"), // YYYY-MM-DD
    status: text("status").notNull().default("open"), // open | in_progress | done | postponed | cancelled
    priority: text("priority").notNull().default("normal"), // low | normal | high
    /** Tekrarlama: null | "weekly" — teslim geçince otomatik +7 gün yenilenir. */
    recur: text("recur"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("homeworks_status_idx").on(table.status)],
);

export const homeworkUpdates = pgTable("homework_updates", {
  id: serial("id").primaryKey(),
  homeworkId: integer("homework_id")
    .notNull()
    .references(() => homeworks.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  note: text("note").notNull().default(""),
  newDueDate: text("new_due_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    date: text("date").notNull(), // YYYY-MM-DD
    time: text("time"), // HH:MM
    scope: text("scope").notNull().default("class"), // class | personal
    type: text("type").notNull().default("reminder"), // reminder | exam | activity | deadline
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("events_date_idx").on(table.date)],
);

export const scheduleSlots = pgTable(
  "schedule_slots",
  {
    id: serial("id").primaryKey(),
    dayOfWeek: integer("day_of_week").notNull(), // 1 = Pazartesi ... 5 = Cuma
    period: integer("period").notNull(), // 1..8
    subject: text("subject").notNull(),
    teacher: text("teacher").notNull().default(""),
    room: text("room").notNull().default(""),
    startTime: text("start_time").notNull().default(""),
    endTime: text("end_time").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("schedule_day_period_unique").on(table.dayOfWeek, table.period)],
);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  authorName: text("author_name").notNull().default("Bilinmeyen"),
  body: text("body").notNull(),
  homeworkId: integer("homework_id").references(() => homeworks.id, { onDelete: "set null" }),
  /** Ekler: [{id,name,mime,size,kind,url}] — /api/files/<id> üzerinden servis edilir. */
  attachments: jsonb("attachments").$type<unknown[]>().default([]),
  /** Mention: kullanıcı id listesi (@pingleme). */
  mentions: jsonb("mentions").$type<unknown[]>().default([]),
  /** Herkes için silindi: gövde gizlenir, "bu mesaj silindi" gösterilir. */
  deletedForAll: boolean("deleted_for_all").notNull().default(false),
  /** Kendi için sildi (id listesi) — listeleme sırasında filtrelenir. */
  deletedFor: jsonb("deleted_for").$type<unknown[]>().default([]),
  /** Düzenlendi mi (saati değişmez, üstte "düzenlendi" yazar). */
  edited: boolean("edited").notNull().default(false),
  /** Cevap verilen mesaj (WhatsApp alıntı). */
  replyToId: integer("reply_to_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Mesaj görülme kayıtları: WhatsApp mavi tiki veri kaynağı. */
export const messageReads = pgTable("message_reads", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sohbete yüklenen dosyalar (base64 gövde DB'de; ücretsiz katman için 6 MB tavan). */
export const chatFiles = pgTable("chat_files", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mime: text("mime").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  data: text("data").notNull(), // base64
  uploaderId: integer("uploader_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Asistanın kullanıcı başına uzun vadeli hafızası. */
export const aiMemory = pgTable("ai_memory", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Asistan projeleri: konuşmaları ve notları birlikte gruplar. */
export const assistantProjects = pgTable("assistant_projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Deneme / net takibi: her satır bir (deneme, ders) sonucudur. Net = doğru - yanlış/4. */
export const mockExams = pgTable(
  "mock_exams",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    examName: text("exam_name").notNull(),
    examType: text("exam_type").notNull().default("TYT"), // TYT | AYT | Ders
    subject: text("subject").notNull().default("Genel"),
    date: text("date").notNull(), // YYYY-MM-DD
    correct: integer("correct").notNull().default(0),
    wrong: integer("wrong").notNull().default(0),
    empty: integer("empty").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("mock_exams_user_date_idx").on(table.userId, table.date)],
);

/** Başkan tarafından yayınlanan, tüm sınıfa görünen duyurular. */
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assistantMessages = pgTable("assistant_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  actions: jsonb("actions").$type<unknown[]>().default([]),
  projectId: integer("project_id").references(() => assistantProjects.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Homework = typeof homeworks.$inferSelect;
export type HomeworkUpdate = typeof homeworkUpdates.$inferSelect;
export type ClassEvent = typeof events.$inferSelect;
export type ScheduleSlot = typeof scheduleSlots.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MessageRead = typeof messageReads.$inferSelect;
export type ChatFile = typeof chatFiles.$inferSelect;
export type AiMemory = typeof aiMemory.$inferSelect;
export type AssistantProject = typeof assistantProjects.$inferSelect;
export type AssistantMessage = typeof assistantMessages.$inferSelect;
export type MockExam = typeof mockExams.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
