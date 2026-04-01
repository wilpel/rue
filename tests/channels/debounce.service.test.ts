import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DebounceService, type DebouncedBatch } from "../../src/channels/debounce.service.js";
import type { InboundMessage } from "../../src/channels/channel-adapter.js";

function msg(chatId: string, text: string, media?: any[]): InboundMessage {
  return { channelId: "telegram", chatId, senderId: "user-1", messageId: `m-${Date.now()}`, text, media, timestamp: Date.now() };
}

describe("DebounceService", () => {
  let debounce: DebounceService;
  let batches: DebouncedBatch[];

  beforeEach(() => {
    vi.useFakeTimers();
    debounce = new DebounceService({ textGapMs: 200, mediaGapMs: 50, maxFragments: 12, maxChars: 10000 });
    batches = [];
    debounce.onBatch((batch) => batches.push(batch));
  });

  afterEach(() => { vi.useRealTimers(); });

  it("batches rapid text messages within gap window", () => {
    debounce.push(msg("chat-1", "hello"));
    debounce.push(msg("chat-1", "world"));
    expect(batches).toHaveLength(0);
    vi.advanceTimersByTime(200);
    expect(batches).toHaveLength(1);
    expect(batches[0].combinedText).toBe("hello\nworld");
    expect(batches[0].messages).toHaveLength(2);
  });

  it("isolates chats from each other", () => {
    debounce.push(msg("chat-1", "one"));
    debounce.push(msg("chat-2", "two"));
    vi.advanceTimersByTime(200);
    expect(batches).toHaveLength(2);
  });

  it("resets timer on new message within gap", () => {
    debounce.push(msg("chat-1", "a"));
    vi.advanceTimersByTime(150);
    debounce.push(msg("chat-1", "b"));
    vi.advanceTimersByTime(150);
    expect(batches).toHaveLength(0);
    vi.advanceTimersByTime(50);
    expect(batches).toHaveLength(1);
    expect(batches[0].combinedText).toBe("a\nb");
  });

  it("flushes immediately when maxFragments reached", () => {
    for (let i = 0; i < 12; i++) debounce.push(msg("chat-1", `msg${i}`));
    expect(batches).toHaveLength(1);
  });

  it("flushes immediately when maxChars reached", () => {
    debounce.push(msg("chat-1", "x".repeat(10001)));
    expect(batches).toHaveLength(1);
  });
});
