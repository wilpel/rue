import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MessageStore } from "../../src/messages/store.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("MessageStore", () => {
  let tmpDir: string;
  let store: MessageStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-msg-test-"));
    store = new MessageStore(tmpDir);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends and retrieves messages", () => {
    const msg = store.append({ role: "user", content: "hello" });
    expect(msg.id).toMatch(/^msg_/);
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("hello");
    expect(msg.timestamp).toBeTypeOf("number");
  });

  it("gets a message by id", () => {
    const msg = store.append({ role: "assistant", content: "hi back" });
    const fetched = store.get(msg.id);
    expect(fetched).toBeDefined();
    expect(fetched!.content).toBe("hi back");
  });

  it("returns null for missing id", () => {
    expect(store.get("nonexistent")).toBeNull();
  });

  it("returns recent messages newest last", () => {
    store.append({ role: "user", content: "first" });
    store.append({ role: "assistant", content: "second" });
    store.append({ role: "user", content: "third" });

    const recent = store.recent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].content).toBe("second");
    expect(recent[1].content).toBe("third");
  });

  it("stores metadata", () => {
    const msg = store.append({
      role: "agent-event",
      content: "agent spawned",
      metadata: { agentId: "a1", task: "test" },
    });
    const fetched = store.get(msg.id);
    expect(fetched!.metadata).toEqual({ agentId: "a1", task: "test" });
  });

  it("stores session id", () => {
    const msg = store.append({
      role: "assistant",
      content: "response",
      sessionId: "session-123",
    });
    const fetched = store.get(msg.id);
    expect(fetched!.sessionId).toBe("session-123");
  });

  it("queries by role", () => {
    store.append({ role: "user", content: "q1" });
    store.append({ role: "assistant", content: "a1" });
    store.append({ role: "user", content: "q2" });

    const userMsgs = store.query({ role: "user" });
    expect(userMsgs).toHaveLength(2);
    expect(userMsgs.every((m) => m.role === "user")).toBe(true);
  });

  it("queries with time range", () => {
    store.append({ role: "user", content: "old" });
    const cutoff = Date.now();
    store.append({ role: "user", content: "new" });

    const after = store.query({ after: cutoff - 1 });
    expect(after.length).toBeGreaterThanOrEqual(1);
  });

  it("supports push messages from agents", () => {
    const msg = store.append({
      role: "push",
      content: "Task completed: refactoring done",
      metadata: { source: "agent_abc", type: "task_complete" },
    });
    expect(msg.role).toBe("push");
    const recent = store.recent(1);
    expect(recent[0].role).toBe("push");
  });

  it("persists across instances", () => {
    store.append({ role: "user", content: "persistent" });
    store.close();

    const store2 = new MessageStore(tmpDir);
    const recent = store2.recent(1);
    expect(recent[0].content).toBe("persistent");
    store2.close();
  });

  it("counts messages", () => {
    store.append({ role: "user", content: "a" });
    store.append({ role: "user", content: "b" });
    expect(store.count()).toBe(2);
  });
});
