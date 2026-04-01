import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Database, { type Database as DB } from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as schema from "./schema.js";

/** DB extended with a convenience .all() shorthand */
export type ExtendedDB = DB & { all(sql: string, ...params: unknown[]): unknown[] };

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly db: ExtendedDB;
  private readonly drizzleDb: BetterSQLite3Database<typeof schema>;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "rue.sqlite");
    const raw = new Database(dbPath) as ExtendedDB;
    raw.pragma("journal_mode = WAL");
    raw.pragma("foreign_keys = ON");
    // Convenience shorthand: db.all(sql, ...params) → db.prepare(sql).all(...params)
    raw.all = (sql: string, ...params: unknown[]) => raw.prepare(sql).all(...params) as unknown[];
    this.db = raw;
    this.drizzleDb = drizzle(this.db, { schema });
    this.migrate();
  }

  getDb(): ExtendedDB {
    return this.db;
  }

  getDrizzle(): BetterSQLite3Database<typeof schema> {
    return this.drizzleDb;
  }

  close(): void {
    this.db.close();
  }

  onModuleDestroy(): void {
    this.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        session_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

      CREATE TABLE IF NOT EXISTS facts (
        key TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        task TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_run_at INTEGER,
        next_run_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        type TEXT NOT NULL DEFAULT 'work',
        priority TEXT DEFAULT 'normal',
        agent_id TEXT,
        due_at INTEGER,
        schedule TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at);

      CREATE TABLE IF NOT EXISTS telegram_users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        paired_at TEXT NOT NULL
      );
    `);
  }
}
