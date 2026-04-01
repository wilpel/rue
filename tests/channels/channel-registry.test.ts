import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelRegistry } from "../../src/channels/channel-registry.js";
import type { ChannelAdapter, InboundMessage } from "../../src/channels/channel-adapter.js";

function createMockAdapter(id: string) {
  const handlers: Array<(msg: InboundMessage) => void> = [];
  return {
    id,
    capabilities: new Set(["reactions"]) as any,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ messageId: "sent-1", chatId: "123", channelId: id }),
    sendReaction: vi.fn().mockResolvedValue(undefined),
    onMessage: (handler: (msg: InboundMessage) => void) => { handlers.push(handler); return () => { const i = handlers.indexOf(handler); if (i >= 0) handlers.splice(i, 1); }; },
    _emit: (msg: InboundMessage) => handlers.forEach(h => h(msg)),
  };
}

describe("ChannelRegistry", () => {
  let registry: ChannelRegistry;
  beforeEach(() => { registry = new ChannelRegistry(); });

  it("registers and retrieves adapter", () => {
    const a = createMockAdapter("telegram");
    registry.register(a as any);
    expect(registry.get("telegram")).toBe(a);
  });

  it("returns undefined for unknown", () => {
    expect(registry.get("discord")).toBeUndefined();
  });

  it("startAll calls start on all", async () => {
    const a1 = createMockAdapter("telegram");
    const a2 = createMockAdapter("discord");
    registry.register(a1 as any);
    registry.register(a2 as any);
    await registry.startAll();
    expect(a1.start).toHaveBeenCalled();
    expect(a2.start).toHaveBeenCalled();
  });

  it("routes sendMessage to correct adapter", async () => {
    const a = createMockAdapter("telegram");
    registry.register(a as any);
    await registry.sendMessage("telegram", { chatId: "123" }, "hello");
    expect(a.sendMessage).toHaveBeenCalledWith({ chatId: "123" }, "hello", undefined);
  });

  it("throws on unknown channel", async () => {
    await expect(registry.sendMessage("discord", { chatId: "1" }, "hi")).rejects.toThrow("No adapter");
  });

  it("forwards inbound to global handler", () => {
    const a = createMockAdapter("telegram");
    registry.register(a as any);
    const received: InboundMessage[] = [];
    registry.onMessage((msg) => received.push(msg));
    a._emit({ channelId: "telegram", chatId: "123", senderId: "456", messageId: "1", text: "hello", timestamp: Date.now() });
    expect(received).toHaveLength(1);
    expect(received[0].text).toBe("hello");
  });

  it("listAdapters returns registered ids", () => {
    registry.register(createMockAdapter("telegram") as any);
    registry.register(createMockAdapter("discord") as any);
    expect(registry.listAdapters()).toEqual(["telegram", "discord"]);
  });
});
