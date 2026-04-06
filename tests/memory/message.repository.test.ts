import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DatabaseService } from "../../src/database/database.service.js";
import { MessageRepository } from "../../src/memory/message.repository.js";

describe("MessageRepository", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let repo: MessageRepository;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-msg-test-"));
    dbService = new DatabaseService(tmpDir);
    repo = new MessageRepository(dbService);
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends and retrieves messages", () => {
    repo.append({ role: "user", content: "hello" });
    repo.append({ role: "assistant", content: "hi there" });
    const messages = repo.recent(10);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  it("recent returns newest last", () => {
    repo.append({ role: "user", content: "first" });
    repo.append({ role: "user", content: "second" });
    const messages = repo.recent(10);
    expect(messages[0].content).toBe("first");
    expect(messages[1].content).toBe("second");
  });

  it("respects limit", () => {
    for (let i = 0; i < 10; i++) repo.append({ role: "user", content: `msg-${i}` });
    const messages = repo.recent(3);
    expect(messages).toHaveLength(3);
  });

  it("stores metadata as JSON", () => {
    repo.append({ role: "push", content: "test", metadata: { source: "scheduler" } });
    const messages = repo.recent(1);
    expect(messages[0].metadata).toEqual({ source: "scheduler" });
  });

  it("counts messages", () => {
    repo.append({ role: "user", content: "a" });
    repo.append({ role: "user", content: "b" });
    expect(repo.count()).toBe(2);
  });

  it("stores messages with channel role", () => {
    repo.append({ role: "channel", content: "test", metadata: { tag: "USER_TELEGRAM", chatId: 123 } });
    const msgs = repo.recent(1);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("channel");
    expect(msgs[0].metadata?.tag).toBe("USER_TELEGRAM");
  });

  describe("compactHistory", () => {
    it("returns empty string for no messages", () => {
      expect(repo.compactHistory()).toBe("");
    });

    it("returns all verbatim when under recentVerbatim threshold", () => {
      repo.append({ role: "user", content: "hello" });
      repo.append({ role: "assistant", content: "hi" });
      const result = repo.compactHistory({ recentVerbatim: 5 });
      expect(result).toBe("[USER] hello\n[AGENT_RUE] hi");
      expect(result).not.toContain("compacted");
    });

    it("truncates older messages and keeps recent verbatim", () => {
      for (let i = 0; i < 10; i++) {
        repo.append({ role: "user", content: `message number ${i} ${"x".repeat(120)}`, metadata: { tag: "USER" } });
      }
      const result = repo.compactHistory({ limit: 10, recentVerbatim: 3 });
      expect(result).toContain("--- Earlier (compacted) ---");
      expect(result).toContain("--- Recent ---");
      // Older messages should be truncated (100 chars + "...")
      expect(result).toContain("...");
      // Recent messages should be full length
      const recentSection = result.split("--- Recent ---")[1];
      expect(recentSection).toContain("x".repeat(120));
    });

    it("uses metadata tag when available", () => {
      repo.append({ role: "channel", content: "test", metadata: { tag: "USER_TELEGRAM" } });
      const result = repo.compactHistory();
      expect(result).toContain("[USER_TELEGRAM]");
    });

    it("filters by chatId when specified", () => {
      repo.append({ role: "channel", content: "chat1", metadata: { chatId: 100, tag: "USER" } });
      repo.append({ role: "channel", content: "chat2", metadata: { chatId: 200, tag: "USER" } });
      const result = repo.compactHistory({ chatId: 100 });
      expect(result).toContain("chat1");
      expect(result).not.toContain("chat2");
    });
  });

  it("recentByChatId filters by chatId at SQL level", () => {
    repo.append({ role: "channel" as any, content: "msg1", metadata: { chatId: 100, tag: "USER_TELEGRAM" } });
    repo.append({ role: "channel" as any, content: "msg2", metadata: { chatId: 200, tag: "USER_TELEGRAM" } });
    repo.append({ role: "channel" as any, content: "msg3", metadata: { chatId: 100, tag: "AGENT_RUE" } });

    const chat100 = repo.recentByChatId(100, 10);
    expect(chat100).toHaveLength(2);
    expect(chat100[0].content).toBe("msg1");
    expect(chat100[1].content).toBe("msg3");

    const chat200 = repo.recentByChatId(200, 10);
    expect(chat200).toHaveLength(1);
    expect(chat200[0].content).toBe("msg2");
  });
});
