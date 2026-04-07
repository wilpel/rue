import { Injectable, Inject } from "@nestjs/common";
import { SupabaseService } from "../database/supabase.service.js";
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
  constructor(@Inject(SupabaseService) private readonly db: SupabaseService) {}

  async append(msg: { role: MessageRole; content: string; sessionId?: string; metadata?: Record<string, unknown> }): Promise<StoredMessage> {
    const id = `msg_${nanoid(12)}`;
    const createdAt = Date.now();
    await this.db.from("messages").insert({
      id, role: msg.role, content: msg.content,
      metadata: msg.metadata ?? null,
      session_id: msg.sessionId ?? null, created_at: createdAt,
    });
    return { id, role: msg.role, content: msg.content, createdAt, sessionId: msg.sessionId, metadata: msg.metadata };
  }

  async recent(limit = 20): Promise<StoredMessage[]> {
    const { data } = await this.db.from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).reverse().map(this.toStoredMessage);
  }

  async recentByChatId(chatId: string | number, limit = 20): Promise<StoredMessage[]> {
    // Fetch newest N, then reverse to get chronological order (oldest first)
    const { data } = await this.db.from("messages")
      .select("*")
      .eq("metadata->>chatId", String(chatId))
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).reverse().map(this.toStoredMessage);
  }

  async get(id: string): Promise<StoredMessage | null> {
    const { data } = await this.db.from("messages").select("*").eq("id", id).single();
    return data ? this.toStoredMessage(data) : null;
  }

  async count(): Promise<number> {
    const { count } = await this.db.from("messages").select("*", { count: "exact", head: true });
    return count ?? 0;
  }

  /**
   * Returns compacted history: older messages truncated, recent ones verbatim.
   */
  async compactHistory(opts?: { limit?: number; recentVerbatim?: number; chatId?: string | number }): Promise<string> {
    const limit = opts?.limit ?? 20;
    const recentCount = opts?.recentVerbatim ?? 5;

    const all = opts?.chatId
      ? await this.recentByChatId(opts.chatId, limit)
      : await this.recent(limit);

    if (all.length === 0) return "";

    const formatTag = (m: StoredMessage) =>
      (m.metadata as Record<string, unknown>)?.tag as string
        ?? (m.role === "assistant" ? "AGENT_RUE" : "USER");

    if (all.length <= recentCount) {
      return all.map(m => `[${formatTag(m)}] ${m.content}`).join("\n");
    }

    const older = all.slice(0, -recentCount);
    const recent = all.slice(-recentCount);

    const compacted = older.map(m => {
      const tag = formatTag(m);
      const short = m.content.length > 100 ? m.content.slice(0, 100) + "..." : m.content;
      return `[${tag}] ${short}`;
    });

    return [
      "--- Earlier (compacted) ---",
      ...compacted,
      "--- Recent ---",
      ...recent.map(m => `[${formatTag(m)}] ${m.content}`),
    ].join("\n");
  }

  private toStoredMessage(row: Record<string, unknown>): StoredMessage {
    return {
      id: row.id as string,
      role: row.role as MessageRole,
      content: row.content as string,
      createdAt: row.created_at as number,
      sessionId: (row.session_id as string) ?? undefined,
      metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    };
  }
}
