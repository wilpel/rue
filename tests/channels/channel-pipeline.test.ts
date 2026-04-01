import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChannelRegistry } from "../../src/channels/channel-registry.js";
import { DebounceService, type DebouncedBatch } from "../../src/channels/debounce.service.js";
import { CliAdapter } from "../../src/channels/adapters/cli.adapter.js";

describe("Channel Pipeline Integration", () => {
  let registry: ChannelRegistry;
  let debounce: DebounceService;
  let cli: CliAdapter;
  let batches: DebouncedBatch[];

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new ChannelRegistry();
    debounce = new DebounceService({ textGapMs: 100, mediaGapMs: 50, maxFragments: 12, maxChars: 10000 });
    cli = new CliAdapter();
    batches = [];

    // Wire the pipeline: adapter → registry → debounce → collect
    registry.register(cli);
    registry.onMessage((msg) => debounce.push(msg));
    debounce.onBatch((batch) => batches.push(batch));
  });

  afterEach(() => vi.useRealTimers());

  it("single message flows through pipeline", () => {
    cli.injectMessage("chat-1", "hello from CLI");
    vi.advanceTimersByTime(100);

    expect(batches).toHaveLength(1);
    expect(batches[0].channelId).toBe("cli");
    expect(batches[0].chatId).toBe("chat-1");
    expect(batches[0].combinedText).toBe("hello from CLI");
  });

  it("rapid messages get batched", () => {
    cli.injectMessage("chat-1", "first");
    cli.injectMessage("chat-1", "second");
    cli.injectMessage("chat-1", "third");
    vi.advanceTimersByTime(100);

    expect(batches).toHaveLength(1);
    expect(batches[0].messages).toHaveLength(3);
    expect(batches[0].combinedText).toBe("first\nsecond\nthird");
  });

  it("different chats produce separate batches", () => {
    cli.injectMessage("chat-1", "from chat 1");
    cli.injectMessage("chat-2", "from chat 2");
    vi.advanceTimersByTime(100);

    expect(batches).toHaveLength(2);
    const chat1 = batches.find(b => b.chatId === "chat-1")!;
    const chat2 = batches.find(b => b.chatId === "chat-2")!;
    expect(chat1.combinedText).toBe("from chat 1");
    expect(chat2.combinedText).toBe("from chat 2");
  });

  it("response flows back through adapter", async () => {
    const responses: string[] = [];
    cli.onResponse((_chatId, text) => responses.push(text));

    await registry.sendMessage("cli", { chatId: "chat-1" }, "agent response");

    expect(responses).toEqual(["agent response"]);
  });

  it("full round-trip: inject → batch → response", async () => {
    const responses: string[] = [];
    cli.onResponse((_chatId, text) => responses.push(text));

    // Simulate inbound
    cli.injectMessage("chat-1", "user says hello");
    vi.advanceTimersByTime(100);

    expect(batches).toHaveLength(1);

    // Simulate agent response
    await registry.sendMessage("cli", { chatId: "chat-1" }, "agent says hi back");

    expect(responses).toEqual(["agent says hi back"]);
  });

  it("pipeline handles multiple adapters simultaneously", () => {
    // Add a second mock adapter
    const handlers: Array<(msg: any) => void> = [];
    const mockDiscord = {
      id: "discord",
      capabilities: new Set([]),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue({ messageId: "d1", chatId: "dc-1", channelId: "discord" }),
      sendReaction: vi.fn().mockResolvedValue(undefined),
      onMessage: (h: any) => { handlers.push(h); return () => {}; },
    };
    registry.register(mockDiscord as any);

    // Messages from both adapters
    cli.injectMessage("cli-chat", "from cli");
    handlers[0]({ channelId: "discord", chatId: "dc-chat", senderId: "u", messageId: "m", text: "from discord", timestamp: Date.now() });
    vi.advanceTimersByTime(100);

    expect(batches).toHaveLength(2);
    expect(batches.find(b => b.channelId === "cli")!.combinedText).toBe("from cli");
    expect(batches.find(b => b.channelId === "discord")!.combinedText).toBe("from discord");
  });
});
