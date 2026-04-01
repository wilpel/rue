import { Injectable, Inject } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { messages } from "../database/schema.js";
import { desc, count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export type MessageRole = "user" | "assistant" | "system" | "agent-event" | "push" | "channel";

export interface StoredMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class MessageRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  append(msg: { role: MessageRole; content: string; sessionId?: string; metadata?: Record<string, unknown> }): StoredMessage {
    const id = `msg_${nanoid(12)}`;
    const createdAt = Date.now();
    this.db.getDrizzle().insert(messages).values({
      id, role: msg.role, content: msg.content,
      metadata: msg.metadata ? JSON.stringify(msg.metadata) : null,
      sessionId: msg.sessionId ?? null, createdAt,
    }).run();
    return { id, role: msg.role, content: msg.content, createdAt, sessionId: msg.sessionId, metadata: msg.metadata };
  }

  recent(limit = 20): StoredMessage[] {
    const rows = this.db.getDrizzle().select().from(messages).orderBy(desc(messages.createdAt)).limit(limit).all();
    return rows.reverse().map(this.toStoredMessage);
  }

  recentByChatId(chatId: string | number, limit = 20): StoredMessage[] {
    type RawRow = { id: string; role: string; content: string; metadata: string | null; session_id: string | null; created_at: number };
    const rows = this.db.getDb().all(
      `SELECT id, role, content, metadata, session_id, created_at FROM messages WHERE json_extract(metadata, '$.chatId') = ? ORDER BY created_at ASC LIMIT ?`,
      chatId, limit,
    ) as RawRow[];
    return rows.map(row => ({
      id: row.id,
      role: row.role as MessageRole,
      content: row.content,
      createdAt: row.created_at,
      sessionId: row.session_id ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  get(id: string): StoredMessage | null {
    const row = this.db.getDrizzle().select().from(messages).where(eq(messages.id, id)).get();
    return row ? this.toStoredMessage(row) : null;
  }

  count(): number {
    const result = this.db.getDrizzle().select({ cnt: count() }).from(messages).get();
    return result?.cnt ?? 0;
  }

  private toStoredMessage(row: typeof messages.$inferSelect): StoredMessage {
    return {
      id: row.id, role: row.role as MessageRole, content: row.content, createdAt: row.createdAt,
      sessionId: row.sessionId ?? undefined, metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}
