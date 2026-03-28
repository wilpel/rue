import Database, { type Database as DB } from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import { nanoid } from "nanoid";

export type MessageRole = "user" | "assistant" | "system" | "agent-event" | "push";

export interface StoredMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface MessageQuery {
  limit?: number;
  before?: number;  // timestamp
  after?: number;   // timestamp
  role?: MessageRole;
  sessionId?: string;
}

export class MessageStore {
  private db: DB;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(path.join(dir, "messages.sqlite"));
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  /**
   * Append a message. Returns the stored message with generated ID.
   * This is the single entry point for ALL messages — user input,
   * assistant responses, agent events, proactive pushes.
   */
  append(msg: {
    role: MessageRole;
    content: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): StoredMessage {
    const id = `msg_${nanoid(12)}`;
    const timestamp = Date.now();
    const metaJson = msg.metadata ? JSON.stringify(msg.metadata) : null;

    this.db
      .prepare(
        "INSERT INTO messages (id, role, content, timestamp, session_id, metadata) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, msg.role, msg.content, timestamp, msg.sessionId ?? null, metaJson);

    return {
      id,
      role: msg.role,
      content: msg.content,
      timestamp,
      sessionId: msg.sessionId,
      metadata: msg.metadata,
    };
  }

  /**
   * Get recent messages, newest last. Default 20.
   */
  recent(limit = 20): StoredMessage[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?",
      )
      .all(limit) as RawRow[];

    return rows.reverse().map(rowToMessage);
  }

  /**
   * Query messages with filters.
   */
  query(q: MessageQuery): StoredMessage[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q.before) {
      conditions.push("timestamp < ?");
      params.push(q.before);
    }
    if (q.after) {
      conditions.push("timestamp > ?");
      params.push(q.after);
    }
    if (q.role) {
      conditions.push("role = ?");
      params.push(q.role);
    }
    if (q.sessionId) {
      conditions.push("session_id = ?");
      params.push(q.sessionId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = q.limit ?? 50;

    const rows = this.db
      .prepare(`SELECT * FROM messages ${where} ORDER BY timestamp DESC LIMIT ?`)
      .all(...params, limit) as RawRow[];

    return rows.reverse().map(rowToMessage);
  }

  /**
   * Get a single message by ID.
   */
  get(id: string): StoredMessage | null {
    const row = this.db
      .prepare("SELECT * FROM messages WHERE id = ?")
      .get(id) as RawRow | undefined;

    return row ? rowToMessage(row) : null;
  }

  /**
   * Count total messages.
   */
  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM messages").get() as { cnt: number };
    return row.cnt;
  }

  close(): void {
    this.db.close();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        session_id TEXT,
        metadata TEXT
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)
    `);
  }
}

interface RawRow {
  id: string;
  role: string;
  content: string;
  timestamp: number;
  session_id: string | null;
  metadata: string | null;
}

function rowToMessage(row: RawRow): StoredMessage {
  return {
    id: row.id,
    role: row.role as MessageRole,
    content: row.content,
    timestamp: row.timestamp,
    sessionId: row.session_id ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}
