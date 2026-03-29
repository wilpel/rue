/**
 * Shared helpers for skills and daemon to interact with the DB.
 * Import from "../../lib/db/helpers.js" in skills or "../../../lib/db/helpers.js" in src.
 */
import { getDb, messages, projects, tasks, events, scheduledJobs, triggers, facts, eq, desc, and, sql } from "./index.js";
import { nanoid } from "nanoid";

// ── Messages ────────────────────────────────────────────────

export function addMessage(role: string, content: string, opts?: { sessionId?: string; metadata?: Record<string, unknown> }) {
  const db = getDb();
  const id = `msg_${nanoid(12)}`;
  const now = Date.now();
  db.insert(messages).values({
    id,
    role,
    content,
    timestamp: now,
    sessionId: opts?.sessionId ?? null,
    metadata: opts?.metadata ? JSON.stringify(opts.metadata) : null,
  }).run();
  return { id, timestamp: now };
}

export function getRecentMessages(limit = 20) {
  const db = getDb();
  return db.select().from(messages).orderBy(desc(messages.timestamp)).limit(limit).all().reverse();
}

// ── Projects ────────────────────────────────────────────────

export function createProject(name: string, description: string, maxAgents = 1) {
  const db = getDb();
  db.insert(projects).values({
    name,
    description,
    maxAgents,
    createdAt: new Date().toISOString(),
  }).run();
}

export function getProject(name: string) {
  const db = getDb();
  return db.select().from(projects).where(eq(projects.name, name)).get();
}

export function listProjects() {
  const db = getDb();
  return db.select().from(projects).all();
}

export function archiveProject(name: string) {
  const db = getDb();
  db.update(projects).set({ status: "archived", updatedAt: new Date().toISOString() }).where(eq(projects.name, name)).run();
}

// ── Tasks ───────────────────────────────────────────────────

export function addTask(projectName: string, title: string, description?: string) {
  const db = getDb();
  const result = db.insert(tasks).values({
    projectName,
    title,
    description: description ?? null,
    status: "todo",
    createdAt: new Date().toISOString(),
  }).run();
  return { id: Number(result.lastInsertRowid) };
}

export function getTask(id: number) {
  const db = getDb();
  return db.select().from(tasks).where(eq(tasks.id, id)).get();
}

export function getProjectTasks(projectName: string) {
  const db = getDb();
  return db.select().from(tasks).where(eq(tasks.projectName, projectName)).all();
}

export function getTasksByStatus(projectName: string, status: string) {
  const db = getDb();
  return db.select().from(tasks).where(and(eq(tasks.projectName, projectName), eq(tasks.status, status))).all();
}

export function updateTaskStatus(id: number, status: string, agent?: string) {
  const db = getDb();
  const updates: Record<string, unknown> = { status };
  if (agent) updates.agent = agent;
  if (status === "in-progress") updates.startedAt = new Date().toISOString();
  if (status === "done" || status === "failed") updates.completedAt = new Date().toISOString();
  db.update(tasks).set(updates).where(eq(tasks.id, id)).run();
}

export function getNextTodoTask(projectName: string) {
  const db = getDb();
  return db.select().from(tasks).where(and(eq(tasks.projectName, projectName), eq(tasks.status, "todo"))).limit(1).get();
}

export function countInProgressTasks(projectName: string): number {
  const db = getDb();
  const result = db.select({ count: sql<number>`count(*)` }).from(tasks).where(and(eq(tasks.projectName, projectName), eq(tasks.status, "in-progress"))).get();
  return result?.count ?? 0;
}

export function resetOrphanedTasks() {
  const db = getDb();
  const result = db.update(tasks).set({ status: "todo", startedAt: null }).where(eq(tasks.status, "in-progress")).run();
  return result.changes;
}

// ── Events ──────────────────────────────────────────────────

export function appendEvent(channel: string, payload: unknown) {
  const db = getDb();
  db.insert(events).values({
    timestamp: Date.now(),
    channel,
    payload: payload ? JSON.stringify(payload) : null,
  }).run();
}

export function getRecentEvents(limit = 30) {
  const db = getDb();
  return db.select().from(events).orderBy(desc(events.seq)).limit(limit).all().reverse().map(e => ({
    ...e,
    payload: e.payload ? JSON.parse(e.payload) : null,
  }));
}

// ── Scheduled Jobs ──────────────────────────────────────────

export function createJob(id: string, name: string, schedule: string, task: string, nextRunAt: number | null) {
  const db = getDb();
  db.insert(scheduledJobs).values({ id, name, schedule, task, createdAt: Date.now(), nextRunAt }).run();
}

export function listJobs() {
  const db = getDb();
  return db.select().from(scheduledJobs).all();
}

export function removeJob(id: string) {
  const db = getDb();
  return db.delete(scheduledJobs).where(eq(scheduledJobs.id, id)).run().changes;
}

// ── Triggers ────────────────────────────────────────────────

export function createTrigger(id: string, name: string, event: string, condition: string, action: string) {
  const db = getDb();
  db.insert(triggers).values({ id, name, event, condition, action, createdAt: Date.now() }).run();
}

export function listTriggers() {
  const db = getDb();
  return db.select().from(triggers).all();
}

export function removeTrigger(id: string) {
  const db = getDb();
  return db.delete(triggers).where(eq(triggers.id, id)).run().changes;
}

// ── Facts (Semantic Memory) ─────────────────────────────────

export function storeFact(key: string, content: string, tags: string[]) {
  const db = getDb();
  const now = Date.now();
  const existing = db.select().from(facts).where(eq(facts.key, key)).get();
  if (existing) {
    db.update(facts).set({ content, tags: JSON.stringify(tags), updatedAt: now }).where(eq(facts.key, key)).run();
  } else {
    db.insert(facts).values({ key, content, tags: JSON.stringify(tags), createdAt: now, updatedAt: now }).run();
  }
}

export function getFact(key: string) {
  const db = getDb();
  const row = db.select().from(facts).where(eq(facts.key, key)).get();
  if (!row) return null;
  return { ...row, tags: JSON.parse(row.tags) as string[] };
}

export function searchFacts(query: string, limit = 10) {
  const db = getDb();
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return [];
  const all = db.select().from(facts).all();
  return all
    .map(row => {
      const lower = row.content.toLowerCase();
      let score = 0;
      for (const w of words) { if (lower.includes(w)) score++; }
      return { ...row, tags: JSON.parse(row.tags) as string[], score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
