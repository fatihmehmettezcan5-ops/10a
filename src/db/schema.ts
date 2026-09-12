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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Homework = typeof homeworks.$inferSelect;
export type HomeworkUpdate = typeof homeworkUpdates.$inferSelect;
export type ClassEvent = typeof events.$inferSelect;
export type ScheduleSlot = typeof scheduleSlots.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AssistantMessage = typeof assistantMessages.$inferSelect;
