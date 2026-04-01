import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../src/database/database.service.js";
import { BusService } from "../../src/bus/bus.service.js";
import { SessionMaintenanceService } from "../../src/database/session-maintenance.service.js";

function insertMessage(
  db: ReturnType<DatabaseService["getDb"]>,
  opts: { createdAt: number; chatId?: number; content?: string },
): void {
  const metadata = opts.chatId != null ? JSON.stringify({ chatId: opts.chatId }) : null;
  db.prepare(
    "INSERT INTO messages (id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), "user", opts.content ?? "test", metadata, opts.createdAt);
}

function insertEvent(
  db: ReturnType<DatabaseService["getDb"]>,
  opts: { createdAt: number },
): void {
  db.prepare(
    "INSERT INTO events (channel, payload, created_at) VALUES (?, ?, ?)",
  ).run("test.channel", "{}", opts.createdAt);
}

describe("SessionMaintenanceService", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let bus: BusService;
  let svc: SessionMaintenanceService;

  const now = Date.now();
  const daysAgo = (d: number) => now - d * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-maintenance-test-"));
    dbService = new DatabaseService(tmpDir);
    bus = new BusService();
  });

  afterEach(() => {
    svc?.onModuleDestroy();
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeSvc(config?: Partial<ConstructorParameters<typeof SessionMaintenanceService>[2]>) {
    svc = new SessionMaintenanceService(dbService, bus, {
      messageTtlDays: 30,
      maxMessagesPerChat: 500,
      vacuumAfterCleanup: false,
      ...config,
    });
    return svc;
  }

  it("prunes messages older than TTL", () => {
    const raw = dbService.getDb();
    insertMessage(raw, { createdAt: daysAgo(31) }); // old — should be deleted
    insertMessage(raw, { createdAt: daysAgo(29) }); // recent — should survive

    const result = makeSvc({ messageTtlDays: 30 }).run();

    expect(result.deletedMessages).toBe(1);
    const remaining = raw.prepare("SELECT COUNT(*) as cnt FROM messages").get() as { cnt: number };
    expect(remaining.cnt).toBe(1);
  });

  it("preserves new messages", () => {
    const raw = dbService.getDb();
    insertMessage(raw, { createdAt: now });
    insertMessage(raw, { createdAt: daysAgo(1) });

    const result = makeSvc({ messageTtlDays: 30 }).run();

    expect(result.deletedMessages).toBe(0);
    const remaining = raw.prepare("SELECT COUNT(*) as cnt FROM messages").get() as { cnt: number };
    expect(remaining.cnt).toBe(2);
  });

  it("caps per-chat messages to maxMessagesPerChat keeping the most recent", () => {
    const raw = dbService.getDb();
    const total = 10;
    const max = 6;
    // Insert 10 messages for chat 42, oldest first
    for (let i = 0; i < total; i++) {
      insertMessage(raw, { createdAt: now - (total - i) * 1000, chatId: 42 });
    }

    const result = makeSvc({ maxMessagesPerChat: max }).run();

    expect(result.deletedMessages).toBe(total - max);
    const remaining = raw.prepare(
      "SELECT COUNT(*) as cnt FROM messages WHERE json_extract(metadata, '$.chatId') = 42",
    ).get() as { cnt: number };
    expect(remaining.cnt).toBe(max);
  });

  it("keeps the most recent messages when capping", () => {
    const raw = dbService.getDb();
    // Insert 5 messages with distinct content ordered by age
    for (let i = 0; i < 5; i++) {
      insertMessage(raw, { createdAt: now - (5 - i) * 1000, chatId: 99, content: `msg-${i}` });
    }

    makeSvc({ maxMessagesPerChat: 3 }).run();

    const rows = raw.prepare(
      "SELECT content FROM messages WHERE json_extract(metadata, '$.chatId') = 99 ORDER BY created_at ASC",
    ).all() as Array<{ content: string }>;
    expect(rows.map(r => r.content)).toEqual(["msg-2", "msg-3", "msg-4"]);
  });

  it("does not cap chats within the message limit", () => {
    const raw = dbService.getDb();
    for (let i = 0; i < 3; i++) {
      insertMessage(raw, { createdAt: now - i * 1000, chatId: 7 });
    }

    const result = makeSvc({ maxMessagesPerChat: 10 }).run();

    expect(result.deletedMessages).toBe(0);
  });

  it("prunes events older than TTL", () => {
    const raw = dbService.getDb();
    insertEvent(raw, { createdAt: daysAgo(31) }); // old
    insertEvent(raw, { createdAt: daysAgo(1) });  // recent

    const result = makeSvc({ messageTtlDays: 30 }).run();

    expect(result.deletedEvents).toBe(1);
    const remaining = raw.prepare("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
    expect(remaining.cnt).toBe(1);
  });

  it("returns zero counts when nothing to prune", () => {
    const result = makeSvc().run();
    expect(result.deletedMessages).toBe(0);
    expect(result.deletedEvents).toBe(0);
  });

  it("does not affect messages without a chatId when capping", () => {
    const raw = dbService.getDb();
    // Messages without chatId should never be touched by capping logic
    for (let i = 0; i < 5; i++) {
      insertMessage(raw, { createdAt: now - i * 1000 }); // no chatId
    }

    const result = makeSvc({ maxMessagesPerChat: 2 }).run();

    expect(result.deletedMessages).toBe(0);
  });
});
