import { describe, it, expect, vi, beforeEach } from "vitest";
import { TelegramAdapter } from "../../../src/channels/adapters/telegram.adapter.js";
import type { TelegramStoreService } from "../../../src/channels/adapters/telegram-store.service.js";
import type { InboundMessage } from "../../../src/channels/channel-adapter.js";

function createMockStore(overrides: Partial<TelegramStoreService> = {}): TelegramStoreService {
  return {
    load: vi.fn().mockReturnValue({ pairedUsers: [], pendingCodes: [] }),
    save: vi.fn(),
    getBotToken: vi.fn().mockReturnValue(undefined),
    setBotToken: vi.fn(),
    getPairedUsers: vi.fn().mockReturnValue([]),
    isUserPaired: vi.fn().mockReturnValue(false),
    addPairedUser: vi.fn(),
    removePairedUser: vi.fn().mockReturnValue(false),
    generatePairingCode: vi.fn().mockReturnValue({ code: "123456", createdAt: 0, expiresAt: 0 }),
    validatePairingCode: vi.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as TelegramStoreService;
}

describe("TelegramAdapter", () => {
  let adapter: TelegramAdapter;
  let store: TelegramStoreService;

  beforeEach(() => {
    store = createMockStore();
    adapter = new TelegramAdapter(store);
  });

  it("has id 'telegram'", () => {
    expect(adapter.id).toBe("telegram");
  });

  it("has reactions and media capabilities", () => {
    expect(adapter.capabilities.has("reactions")).toBe(true);
    expect(adapter.capabilities.has("media")).toBe(true);
    expect(adapter.capabilities.size).toBe(2);
  });

  it("start with no token does not throw", async () => {
    await expect(adapter.start()).resolves.toBeUndefined();
  });

  it("stop with no bot does not throw", async () => {
    await expect(adapter.stop()).resolves.toBeUndefined();
  });

  it("onMessage registers handler and returns unsubscribe", () => {
    const received: InboundMessage[] = [];
    const unsub = adapter.onMessage((msg) => received.push(msg));

    // Access the private emit via casting — simulate an inbound message
    const msg: InboundMessage = {
      channelId: "telegram",
      chatId: "123",
      senderId: "456",
      messageId: "1",
      text: "hello",
      timestamp: Date.now(),
    };

    // Trigger emit by calling onMessage handlers directly through another registered handler trick
    // Instead, we test via the adapter's internal emit — we register, then unsubscribe
    expect(typeof unsub).toBe("function");

    unsub();
    // After unsub, handler should not receive messages
    expect(received).toHaveLength(0);
  });

  it("onMessage handler receives emitted messages", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    // Use a second handler to trigger emit indirectly — we need access to emit
    // Test via the public interface: register two handlers, verify both receive
    const received2: InboundMessage[] = [];
    adapter.onMessage((msg) => received2.push(msg));

    // We can test the handler plumbing by accessing the private emit through prototype
    const emit = (adapter as any).emit.bind(adapter);
    const msg: InboundMessage = {
      channelId: "telegram",
      chatId: "123",
      senderId: "456",
      messageId: "1",
      text: "test message",
      timestamp: Date.now(),
    };
    emit(msg);

    expect(received).toHaveLength(1);
    expect(received[0].text).toBe("test message");
    expect(received2).toHaveLength(1);
  });

  it("sendReaction does not throw without token", async () => {
    await adapter.sendReaction({ chatId: "123" }, "msg-1", "👍");
  });

  it("sendMessage throws without token", async () => {
    await expect(adapter.sendMessage({ chatId: "123" }, "hello")).rejects.toThrow();
  });

  it("unsubscribe removes only that handler", () => {
    const received1: InboundMessage[] = [];
    const received2: InboundMessage[] = [];
    const unsub1 = adapter.onMessage((msg) => received1.push(msg));
    adapter.onMessage((msg) => received2.push(msg));

    unsub1();

    const emit = (adapter as any).emit.bind(adapter);
    emit({
      channelId: "telegram",
      chatId: "1",
      senderId: "1",
      messageId: "1",
      text: "after unsub",
      timestamp: Date.now(),
    });

    expect(received1).toHaveLength(0);
    expect(received2).toHaveLength(1);
  });
});
