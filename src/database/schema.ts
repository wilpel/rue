import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  sessionId: text("session_id"),
  createdAt: integer("created_at").notNull(),
});

export const facts = sqliteTable("facts", {
  key: text("key").primaryKey(),
  content: text("content").notNull(),
  tags: text("tags").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  schedule: text("schedule").notNull(),
  task: text("task").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  lastRunAt: integer("last_run_at"),
  nextRunAt: integer("next_run_at"),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channel: text("channel").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const telegramUsers = sqliteTable("telegram_users", {
  telegramId: integer("telegram_id").primaryKey(),
  username: text("username"),
  pairedAt: text("paired_at").notNull(),
});
