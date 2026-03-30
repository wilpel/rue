import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { InboxService } from "../../src/inbox/inbox.service.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { MessageRepository } from "../../src/memory/message.repository.js";
import { BusService } from "../../src/bus/bus.service.js";

describe("InboxService", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let inbox: InboxService;
  let bus: BusService;
  let messageRepo: MessageRepository;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-inbox-test-"));
    dbService = new DatabaseService(tmpDir);
    messageRepo = new MessageRepository(dbService);
    bus = new BusService();
    inbox = new InboxService(messageRepo, bus);
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("pushes messages and notifies subscribers", () => {
    const handler = vi.fn();
    inbox.onMessage(handler);
    inbox.push("telegram", "Hello from user", { chatId: 123, messageId: 456 });
    expect(handler).toHaveBeenCalledOnce();
    const msg = handler.mock.calls[0][0];
    expect(msg.source).toBe("telegram");
    expect(msg.content).toBe("Hello from user");
    expect(msg.metadata.chatId).toBe(123);
  });

  it("pushes delegate results", () => {
    const handler = vi.fn();
    inbox.onMessage(handler);
    inbox.push("delegate", "Found 3 apartments", { agentId: "delegate-123", task: "search apartments" });
    const msg = handler.mock.calls[0][0];
    expect(msg.source).toBe("delegate");
    expect(msg.content).toBe("Found 3 apartments");
  });

  it("persists messages to MessageRepository", () => {
    inbox.push("telegram", "Test message", {});
    const recent = messageRepo.recent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].content).toBe("Test message");
    expect(recent[0].metadata?.source).toBe("telegram");
  });

  it("emits bus event on push", () => {
    const handler = vi.fn();
    bus.on("message:created", handler);
    inbox.push("websocket", "WS message", {});
    expect(handler).toHaveBeenCalledOnce();
  });

  it("formats display prefix based on source", () => {
    expect(inbox.formatPrefix("telegram")).toBe("[User via Telegram]");
    expect(inbox.formatPrefix("websocket")).toBe("[User via CLI]");
    expect(inbox.formatPrefix("delegate")).toBe("[Sub-Agent]");
    expect(inbox.formatPrefix("scheduler")).toBe("[Scheduled Job]");
    expect(inbox.formatPrefix("unknown")).toBe("[unknown]");
  });

  it("unsubscribes handler", () => {
    const handler = vi.fn();
    const unsub = inbox.onMessage(handler);
    unsub();
    inbox.push("telegram", "Should not fire", {});
    expect(handler).not.toHaveBeenCalled();
  });
});
