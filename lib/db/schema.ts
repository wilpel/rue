import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ── Messages ────────────────────────────────────────────────

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  role: text("role").notNull(), // user, assistant, system, agent-event, push
  content: text("content").notNull(),
  timestamp: integer("timestamp").notNull(),
  sessionId: text("session_id"),
  metadata: text("metadata"), // JSON string
});

// ── Projects ────────────────────────────────────────────────

export const projects = sqliteTable("projects", {
  name: text("name").primaryKey(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"), // active, archived
  maxAgents: integer("max_agents").notNull().default(1),
  tags: text("tags").default("[]"), // JSON array
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

// ── Tasks ───────────────────────────────────────────────────

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectName: text("project_name").notNull().references(() => projects.name),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"), // todo, in-progress, done, failed
  agent: text("agent"),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
});

// ── Events ──────────────────────────────────────────────────

export const events = sqliteTable("events", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  timestamp: integer("timestamp").notNull(),
  channel: text("channel").notNull(),
  payload: text("payload"), // JSON string
});

// ── Scheduled Jobs ──────────────────────────────────────────

export const scheduledJobs = sqliteTable("scheduled_jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  schedule: text("schedule").notNull(),
  task: text("task").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  lastRunAt: integer("last_run_at"),
  nextRunAt: integer("next_run_at"),
});

// ── Triggers ────────────────────────────────────────────────

export const triggers = sqliteTable("triggers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  event: text("event").notNull(),
  condition: text("condition").notNull().default("*"),
  action: text("action").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  fireCount: integer("fire_count").notNull().default(0),
});

// ── Agent Activity Logs ─────────────────────────────────────

export const agentLogs = sqliteTable("agent_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: text("agent_id").notNull(),
  projectName: text("project_name"),
  taskId: integer("task_id"),
  taskTitle: text("task_title"),
  status: text("status").notNull(), // started, output, completed, failed
  content: text("content"),         // latest output or result summary
  createdAt: integer("created_at").notNull(),
});

// ── Semantic Memory ─────────────────────────────────────────

export const facts = sqliteTable("facts", {
  key: text("key").primaryKey(),
  content: text("content").notNull(),
  tags: text("tags").notNull().default("[]"), // JSON array
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
