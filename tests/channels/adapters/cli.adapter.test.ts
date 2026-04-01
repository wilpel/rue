import { describe, it, expect, vi, beforeEach } from "vitest";
import { CliAdapter } from "../../../src/channels/adapters/cli.adapter.js";
import type { InboundMessage } from "../../../src/channels/channel-adapter.js";

describe("CliAdapter", () => {
  let adapter: CliAdapter;

  beforeEach(() => {
    adapter = new CliAdapter();
  });

  it("has id 'cli'", () => {
    expect(adapter.id).toBe("cli");
  });

  it("has no capabilities (no reactions, no media)", () => {
    expect(adapter.capabilities.size).toBe(0);
  });

  it("start and stop resolve without error", async () => {
    await adapter.start();
    await adapter.stop();
  });

  it("injectMessage emits InboundMessage to handlers", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    adapter.injectMessage("cli-123", "hello world");

    expect(received).toHaveLength(1);
    expect(received[0].channelId).toBe("cli");
    expect(received[0].chatId).toBe("cli-123");
    expect(received[0].text).toBe("hello world");
    expect(received[0].senderId).toBe("cli-user");
    expect(received[0].messageId).toMatch(/^cli-/);
  });

  it("injectMessage with custom senderId", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    adapter.injectMessage("cli-123", "test", "user-456");

    expect(received[0].senderId).toBe("user-456");
  });

  it("onMessage returns unsubscribe function", () => {
    const received: InboundMessage[] = [];
    const unsub = adapter.onMessage((msg) => received.push(msg));

    adapter.injectMessage("cli-1", "before");
    unsub();
    adapter.injectMessage("cli-1", "after");

    expect(received).toHaveLength(1);
    expect(received[0].text).toBe("before");
  });

  it("sendMessage notifies response handlers", async () => {
    const responses: Array<{ chatId: string; text: string }> = [];
    adapter.onResponse((chatId, text) => responses.push({ chatId, text }));

    const result = await adapter.sendMessage({ chatId: "cli-123" }, "response text");

    expect(responses).toHaveLength(1);
    expect(responses[0].chatId).toBe("cli-123");
    expect(responses[0].text).toBe("response text");
    expect(result.channelId).toBe("cli");
    expect(result.chatId).toBe("cli-123");
    expect(result.messageId).toMatch(/^cli-resp-/);
  });

  it("onResponse returns unsubscribe function", async () => {
    const responses: string[] = [];
    const unsub = adapter.onResponse((_chatId, text) => responses.push(text));

    await adapter.sendMessage({ chatId: "cli-1" }, "first");
    unsub();
    await adapter.sendMessage({ chatId: "cli-1" }, "second");

    expect(responses).toHaveLength(1);
    expect(responses[0]).toBe("first");
  });

  it("sendReaction is a no-op (resolves without error)", async () => {
    await adapter.sendReaction({ chatId: "cli-1" }, "msg-1", "👍");
    // No error thrown = success
  });

  it("multiple handlers all receive messages", () => {
    const r1: string[] = [];
    const r2: string[] = [];
    adapter.onMessage((msg) => r1.push(msg.text));
    adapter.onMessage((msg) => r2.push(msg.text));

    adapter.injectMessage("cli-1", "multi");

    expect(r1).toEqual(["multi"]);
    expect(r2).toEqual(["multi"]);
  });

  it("multiple response handlers all receive responses", async () => {
    const r1: string[] = [];
    const r2: string[] = [];
    adapter.onResponse((_id, text) => r1.push(text));
    adapter.onResponse((_id, text) => r2.push(text));

    await adapter.sendMessage({ chatId: "cli-1" }, "test");

    expect(r1).toEqual(["test"]);
    expect(r2).toEqual(["test"]);
  });
});
