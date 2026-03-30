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
});
