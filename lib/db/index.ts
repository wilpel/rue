import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import * as schema from "./schema.js";

export * from "./schema.js";
export { eq, and, or, desc, asc, like, sql, count } from "drizzle-orm";

const DB_DIR = path.join(os.homedir(), ".rue");
const DB_PATH = path.join(DB_DIR, "rue.db");

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Get the shared Drizzle database instance.
 * Creates the database file and runs migrations on first call.
 */
export function getDb() {
  if (_db) return _db;

  fs.mkdirSync(DB_DIR, { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  _db = drizzle(sqlite, { schema });

  // Auto-create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      session_id TEXT,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS projects (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      max_agents INTEGER NOT NULL DEFAULT 1,
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL REFERENCES projects(name),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      agent TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_name);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      channel TEXT NOT NULL,
      payload TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schedule TEXT NOT NULL,
      task TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_run_at INTEGER,
      next_run_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS triggers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      event TEXT NOT NULL,
      condition TEXT NOT NULL DEFAULT '*',
      action TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      fire_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS facts (
      key TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  return _db;
}

/**
 * Get the raw database path for reference.
 */
export function getDbPath(): string {
  return DB_PATH;
}
