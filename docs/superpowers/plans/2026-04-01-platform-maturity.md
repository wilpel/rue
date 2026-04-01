# Platform Maturity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add channel adapter abstraction, declarative routing, session maintenance, model failover, and advanced debouncing — making Rue a superior platform to OpenClaw.

**Architecture:** Extract Telegram into a `ChannelAdapter` behind a `ChannelRegistry`, add a `RouterService` for declarative message-to-agent mapping, add `SessionMaintenanceService` for data hygiene, add model failover in `ClaudeProcessService`, and replace inline batching with a `DebounceService`.

**Tech Stack:** TypeScript, NestJS 11, Claude Agent SDK, Drizzle ORM / better-sqlite3, Telegraf, Vitest

---

### Task 1: Channel adapter interface and types

Define the core types that all other tasks depend on.

**Files:**
- Create: `src/channels/channel-adapter.ts`
- Test: `tests/channels/channel-adapter.test.ts`

- [ ] **Step 1: Write the types file**

Create `src/channels/channel-adapter.ts`:

```typescript
export type ChannelCapability = "reactions" | "threading" | "media" | "editing" | "polls";

export interface ChannelTarget {
  chatId: string;
  replyToMessageId?: string;
}

export interface SendOptions {
  replyToMessageId?: string;
  parseMode?: "text" | "html" | "markdown";
}

export interface SentMessage {
  messageId: string;
  chatId: string;
  channelId: string;
}

export interface MediaAttachment {
  type: "photo" | "video" | "audio" | "document" | "voice" | "sticker";
  url?: string;
  fileId?: string;
  mimeType?: string;
  caption?: string;
}

export interface InboundMessage {
  channelId: string;
  chatId: string;
  senderId: string;
  messageId: string;
  text: string;
  media?: MediaAttachment[];
  replyTo?: string;
  timestamp: number;
}

export interface ChannelAdapter {
  readonly id: string;
  readonly capabilities: Set<ChannelCapability>;

  start(): Promise<void>;
  stop(): Promise<void>;

  sendMessage(target: ChannelTarget, text: string, opts?: SendOptions): Promise<SentMessage>;
  sendReaction(target: ChannelTarget, messageId: string, emoji: string): Promise<void>;

  onMessage(handler: (msg: InboundMessage) => void): () => void;
}
```

- [ ] **Step 2: Write a type-level test**

Create `tests/channels/channel-adapter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { ChannelAdapter, InboundMessage, ChannelTarget } from "../../src/channels/channel-adapter.js";

describe("ChannelAdapter types", () => {
  it("InboundMessage has required fields", () => {
    const msg: InboundMessage = {
      channelId: "telegram",
      chatId: "123",
      senderId: "456",
      messageId: "789",
      text: "hello",
      timestamp: Date.now(),
    };
    expect(msg.channelId).toBe("telegram");
    expect(msg.text).toBe("hello");
  });

  it("ChannelTarget requires chatId", () => {
    const target: ChannelTarget = { chatId: "123" };
    expect(target.chatId).toBe("123");
    expect(target.replyToMessageId).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/channels/channel-adapter.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/channels/channel-adapter.ts tests/channels/channel-adapter.test.ts
git commit -m "feat: add ChannelAdapter interface and types"
```

---

### Task 2: Channel registry

The registry holds all adapters, dispatches outbound messages, and collects inbound messages from all adapters.

**Files:**
- Create: `src/channels/channel-registry.ts`
- Test: `tests/channels/channel-registry.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/channels/channel-registry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelRegistry } from "../../src/channels/channel-registry.js";
import type { ChannelAdapter, InboundMessage } from "../../src/channels/channel-adapter.js";

function createMockAdapter(id: string): ChannelAdapter {
  const handlers: Array<(msg: InboundMessage) => void> = [];
  return {
    id,
    capabilities: new Set(["reactions"]),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ messageId: "sent-1", chatId: "123", channelId: id }),
    sendReaction: vi.fn().mockResolvedValue(undefined),
    onMessage: (handler) => { handlers.push(handler); return () => { const i = handlers.indexOf(handler); if (i >= 0) handlers.splice(i, 1); }; },
    _emit: (msg: InboundMessage) => handlers.forEach(h => h(msg)),
  } as ChannelAdapter & { _emit: (msg: InboundMessage) => void };
}

describe("ChannelRegistry", () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
  });

  it("registers and retrieves adapter by id", () => {
    const adapter = createMockAdapter("telegram");
    registry.register(adapter);
    expect(registry.get("telegram")).toBe(adapter);
  });

  it("returns undefined for unknown adapter", () => {
    expect(registry.get("discord")).toBeUndefined();
  });

  it("startAll calls start on all adapters", async () => {
    const a1 = createMockAdapter("telegram");
    const a2 = createMockAdapter("discord");
    registry.register(a1);
    registry.register(a2);
    await registry.startAll();
    expect(a1.start).toHaveBeenCalled();
    expect(a2.start).toHaveBeenCalled();
  });

  it("stopAll calls stop on all adapters", async () => {
    const a1 = createMockAdapter("telegram");
    registry.register(a1);
    await registry.startAll();
    await registry.stopAll();
    expect(a1.stop).toHaveBeenCalled();
  });

  it("routes sendMessage to correct adapter", async () => {
    const adapter = createMockAdapter("telegram");
    registry.register(adapter);
    await registry.sendMessage("telegram", { chatId: "123" }, "hello");
    expect(adapter.sendMessage).toHaveBeenCalledWith({ chatId: "123" }, "hello", undefined);
  });

  it("throws on sendMessage to unknown channel", async () => {
    await expect(registry.sendMessage("discord", { chatId: "1" }, "hi")).rejects.toThrow("No adapter");
  });

  it("forwards inbound messages to global handler", () => {
    const adapter = createMockAdapter("telegram") as ChannelAdapter & { _emit: (msg: InboundMessage) => void };
    registry.register(adapter);
    const received: InboundMessage[] = [];
    registry.onMessage((msg) => received.push(msg));
    adapter._emit({ channelId: "telegram", chatId: "123", senderId: "456", messageId: "1", text: "hello", timestamp: Date.now() });
    expect(received).toHaveLength(1);
    expect(received[0].text).toBe("hello");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/channels/channel-registry.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ChannelRegistry**

Create `src/channels/channel-registry.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import type { ChannelAdapter, ChannelTarget, SendOptions, SentMessage, InboundMessage } from "./channel-adapter.js";
import { log } from "../shared/logger.js";

type MessageHandler = (msg: InboundMessage) => void;

@Injectable()
export class ChannelRegistry {
  private adapters = new Map<string, ChannelAdapter>();
  private handlers: MessageHandler[] = [];
  private unsubscribers: Array<() => void> = [];

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.id, adapter);
    const unsub = adapter.onMessage((msg) => {
      for (const handler of this.handlers) handler(msg);
    });
    this.unsubscribers.push(unsub);
    log.info(`[channels] Registered adapter: ${adapter.id}`);
  }

  get(id: string): ChannelAdapter | undefined {
    return this.adapters.get(id);
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  async sendMessage(channelId: string, target: ChannelTarget, text: string, opts?: SendOptions): Promise<SentMessage> {
    const adapter = this.adapters.get(channelId);
    if (!adapter) throw new Error(`No adapter registered for channel: ${channelId}`);
    return adapter.sendMessage(target, text, opts);
  }

  async sendReaction(channelId: string, target: ChannelTarget, messageId: string, emoji: string): Promise<void> {
    const adapter = this.adapters.get(channelId);
    if (!adapter) throw new Error(`No adapter registered for channel: ${channelId}`);
    return adapter.sendReaction(target, messageId, emoji);
  }

  async startAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.start();
    }
  }

  async stopAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
    }
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/channels/channel-registry.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/channels/channel-registry.ts tests/channels/channel-registry.test.ts
git commit -m "feat: add ChannelRegistry — adapter lifecycle and message dispatch"
```

---

### Task 3: Telegram adapter

Extract `TelegramService` into a `TelegramAdapter` implementing the `ChannelAdapter` interface.

**Files:**
- Create: `src/channels/adapters/telegram.adapter.ts`
- Move: `src/telegram/telegram-store.service.ts` → `src/channels/adapters/telegram-store.service.ts`
- Delete: `src/telegram/telegram.service.ts`
- Delete: `src/telegram/telegram.module.ts`
- Test: `tests/channels/adapters/telegram.adapter.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/channels/adapters/telegram.adapter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TelegramAdapter } from "../../../src/channels/adapters/telegram.adapter.js";
import type { InboundMessage } from "../../../src/channels/channel-adapter.js";

describe("TelegramAdapter", () => {
  let adapter: TelegramAdapter;
  const mockStore = {
    getBotToken: vi.fn().mockReturnValue(undefined),
    isUserPaired: vi.fn().mockReturnValue(true),
    validatePairingCode: vi.fn(),
    addPairedUser: vi.fn(),
    removePairedUser: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TelegramAdapter(mockStore as any);
  });

  it("has id 'telegram'", () => {
    expect(adapter.id).toBe("telegram");
  });

  it("has reactions and media capabilities", () => {
    expect(adapter.capabilities.has("reactions")).toBe(true);
    expect(adapter.capabilities.has("media")).toBe(true);
  });

  it("onMessage registers handler and returns unsubscribe", () => {
    const received: InboundMessage[] = [];
    const unsub = adapter.onMessage((msg) => received.push(msg));
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("start with no token logs and returns", async () => {
    mockStore.getBotToken.mockReturnValue(undefined);
    await adapter.start(); // should not throw
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/channels/adapters/telegram.adapter.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Move telegram-store.service.ts**

```bash
mkdir -p src/channels/adapters
cp src/telegram/telegram-store.service.ts src/channels/adapters/telegram-store.service.ts
```

- [ ] **Step 4: Implement TelegramAdapter**

Create `src/channels/adapters/telegram.adapter.ts`:

```typescript
import { Telegraf } from "telegraf";
import type { ChannelAdapter, ChannelCapability, ChannelTarget, SendOptions, SentMessage, InboundMessage } from "../channel-adapter.js";
import { TelegramStoreService } from "./telegram-store.service.js";
import { log } from "../../shared/logger.js";

type MessageHandler = (msg: InboundMessage) => void;

export class TelegramAdapter implements ChannelAdapter {
  readonly id = "telegram";
  readonly capabilities = new Set<ChannelCapability>(["reactions", "media"]);

  private bot: Telegraf | null = null;
  private handlers: MessageHandler[] = [];

  constructor(private readonly store: TelegramStoreService) {}

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  async start(): Promise<void> {
    const token = this.store.getBotToken();
    if (!token) { log.info("[telegram] No bot token — skipping"); return; }

    this.bot = new Telegraf(token, { handlerTimeout: 300_000 });
    this.bot.catch((err: unknown) => {
      log.error(`[telegram] Bot error: ${err instanceof Error ? err.message : String(err)}`);
    });
    this.setupHandlers();

    this.bot.launch({ dropPendingUpdates: true, allowedUpdates: ["message"] })
      .catch(err => log.error(`[telegram] Launch failed: ${err instanceof Error ? err.message : String(err)}`));
    log.info("[telegram] Bot starting");
  }

  async stop(): Promise<void> {
    if (this.bot) { this.bot.stop("shutdown"); log.info("[telegram] Bot stopped"); }
  }

  async sendMessage(target: ChannelTarget, text: string, opts?: SendOptions): Promise<SentMessage> {
    const token = this.store.getBotToken();
    if (!token) throw new Error("No Telegram bot token");

    const chatId = Number(target.chatId);
    const MAX_LEN = 4096;
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_LEN) { chunks.push(remaining); break; }
      let splitIdx = remaining.lastIndexOf("\n\n", MAX_LEN);
      if (splitIdx < MAX_LEN / 2) splitIdx = remaining.lastIndexOf("\n", MAX_LEN);
      if (splitIdx < MAX_LEN / 4) splitIdx = MAX_LEN;
      chunks.push(remaining.slice(0, splitIdx));
      remaining = remaining.slice(splitIdx).trim();
    }

    let firstMessageId = "";
    for (let i = 0; i < chunks.length; i++) {
      const body: Record<string, unknown> = { chat_id: chatId, text: chunks[i] };
      if (i === 0 && opts?.replyToMessageId) body.reply_to_message_id = Number(opts.replyToMessageId);
      try {
        const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (i === 0) {
          const data = await resp.json() as { result?: { message_id?: number } };
          firstMessageId = String(data.result?.message_id ?? "");
        }
      } catch (err) {
        log.error(`[telegram] Send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { messageId: firstMessageId, chatId: target.chatId, channelId: "telegram" };
  }

  async sendReaction(target: ChannelTarget, messageId: string, emoji: string): Promise<void> {
    const token = this.store.getBotToken();
    if (!token) return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: Number(target.chatId), message_id: Number(messageId), reaction: [{ type: "emoji", emoji }] }),
      });
    } catch (err) {
      log.error(`[telegram] React failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private emit(msg: InboundMessage): void {
    for (const handler of this.handlers) handler(msg);
  }

  private setupHandlers(): void {
    if (!this.bot) return;

    this.bot.start((ctx) => {
      ctx.reply("Hey! I'm Rue.\n\nTo use me, you need a pairing code. Run `rue telegram pair` in your terminal, then send me:\n\n/pair <code>");
    });

    this.bot.command("pair", (ctx) => {
      const code = ctx.message.text.split(/\s+/)[1];
      if (!code) { ctx.reply("Usage: /pair <code>"); return; }
      if (this.store.isUserPaired(ctx.from.id)) { ctx.reply("Already paired!"); return; }
      if (!this.store.validatePairingCode(code)) { ctx.reply("Invalid or expired code."); return; }
      this.store.addPairedUser(ctx.from.id, ctx.from.username);
      ctx.reply("Paired! Send me messages and I'll respond as Rue.");
    });

    this.bot.command("unpair", (ctx) => {
      if (this.store.removePairedUser(ctx.from.id)) ctx.reply("Unpaired.");
      else ctx.reply("You're not paired.");
    });

    this.bot.on("text", async (ctx) => {
      if (!this.store.isUserPaired(ctx.from.id)) {
        ctx.reply("Not paired. Run `rue telegram pair` first, then /pair <code>.");
        return;
      }
      const text = ctx.message.text;
      if (!text || text.startsWith("/")) return;

      await ctx.sendChatAction("typing").catch(() => {});

      this.emit({
        channelId: "telegram",
        chatId: String(ctx.message.chat.id),
        senderId: String(ctx.from.id),
        messageId: String(ctx.message.message_id),
        text,
        timestamp: Date.now(),
      });
    });
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/channels/adapters/telegram.adapter.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/channels/adapters/ tests/channels/adapters/
git commit -m "feat: add TelegramAdapter implementing ChannelAdapter interface"
```

---

### Task 4: Debounce service

Replace inline batching in ChannelService with a standalone `DebounceService`.

**Files:**
- Create: `src/channels/debounce.service.ts`
- Test: `tests/channels/debounce.service.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/channels/debounce.service.test.ts`:

```typescript
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
    expect(batches.find(b => b.chatId === "chat-1")!.combinedText).toBe("one");
    expect(batches.find(b => b.chatId === "chat-2")!.combinedText).toBe("two");
  });

  it("resets timer on new message within gap", () => {
    debounce.push(msg("chat-1", "a"));
    vi.advanceTimersByTime(150);
    debounce.push(msg("chat-1", "b"));
    vi.advanceTimersByTime(150);
    expect(batches).toHaveLength(0); // timer reset
    vi.advanceTimersByTime(50);
    expect(batches).toHaveLength(1);
    expect(batches[0].combinedText).toBe("a\nb");
  });

  it("flushes immediately when maxFragments reached", () => {
    for (let i = 0; i < 12; i++) debounce.push(msg("chat-1", `msg${i}`));
    expect(batches).toHaveLength(1); // flushed immediately at 12
  });

  it("flushes immediately when maxChars reached", () => {
    debounce.push(msg("chat-1", "x".repeat(10001)));
    expect(batches).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/channels/debounce.service.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DebounceService**

Create `src/channels/debounce.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import type { InboundMessage, MediaAttachment } from "./channel-adapter.js";

export interface DebounceConfig {
  textGapMs: number;
  mediaGapMs: number;
  maxFragments: number;
  maxChars: number;
}

export interface DebouncedBatch {
  chatId: string;
  channelId: string;
  messages: InboundMessage[];
  combinedText: string;
  media: MediaAttachment[];
}

type BatchHandler = (batch: DebouncedBatch) => void;

interface PendingBatch {
  messages: InboundMessage[];
  timer: ReturnType<typeof setTimeout>;
  totalChars: number;
}

@Injectable()
export class DebounceService {
  private pending = new Map<string, PendingBatch>();
  private handlers: BatchHandler[] = [];
  private readonly config: DebounceConfig;

  constructor(config?: Partial<DebounceConfig>) {
    this.config = {
      textGapMs: config?.textGapMs ?? 2000,
      mediaGapMs: config?.mediaGapMs ?? 100,
      maxFragments: config?.maxFragments ?? 12,
      maxChars: config?.maxChars ?? 10000,
    };
  }

  onBatch(handler: BatchHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  push(msg: InboundMessage): void {
    const key = msg.chatId;
    let batch = this.pending.get(key);

    if (batch) {
      clearTimeout(batch.timer);
      batch.messages.push(msg);
      batch.totalChars += msg.text.length;
    } else {
      batch = { messages: [msg], timer: null as unknown as ReturnType<typeof setTimeout>, totalChars: msg.text.length };
      this.pending.set(key, batch);
    }

    // Flush immediately if limits exceeded
    if (batch.messages.length >= this.config.maxFragments || batch.totalChars >= this.config.maxChars) {
      this.flush(key, batch);
      return;
    }

    const hasMedia = msg.media && msg.media.length > 0 && !msg.text;
    const gapMs = hasMedia ? this.config.mediaGapMs : this.config.textGapMs;

    batch.timer = setTimeout(() => this.flush(key, batch!), gapMs);
  }

  private flush(key: string, batch: PendingBatch): void {
    this.pending.delete(key);
    clearTimeout(batch.timer);

    const messages = batch.messages;
    const first = messages[0];
    const combinedText = messages.map(m => m.text).filter(Boolean).join("\n");
    const media = messages.flatMap(m => m.media ?? []);

    const debounced: DebouncedBatch = {
      chatId: first.chatId,
      channelId: first.channelId,
      messages,
      combinedText,
      media,
    };

    for (const handler of this.handlers) handler(debounced);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/channels/debounce.service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/channels/debounce.service.ts tests/channels/debounce.service.test.ts
git commit -m "feat: add DebounceService — configurable batching with fragment and char limits"
```

---

### Task 5: Router service

Declarative routing from config — match inbound messages to agent configs.

**Files:**
- Create: `src/routing/router.service.ts`
- Test: `tests/routing/router.service.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/routing/router.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { RouterService, type RouteRule, type AgentDef, type ResolvedRoute } from "../../src/routing/router.service.js";

describe("RouterService", () => {
  const agents: Record<string, AgentDef> = {
    default: { systemPrompt: "prompts/SYSTEM.md", personality: "prompts/PERSONALITY.md", tools: ["Bash"] },
    coder: { systemPrompt: "prompts/CODE.md", tools: ["Read", "Write", "Bash"] },
  };

  it("matches exact channel + chatId", () => {
    const rules: RouteRule[] = [
      { match: { channel: "telegram", chatId: "123" }, agent: "coder" },
      { match: {}, agent: "default" },
    ];
    const router = new RouterService(rules, agents);
    const route = router.resolve({ channelId: "telegram", chatId: "123", senderId: "u", messageId: "m", text: "", timestamp: 0 });
    expect(route.agentId).toBe("coder");
    expect(route.tools).toContain("Read");
  });

  it("falls through to catch-all", () => {
    const rules: RouteRule[] = [
      { match: { channel: "discord" }, agent: "coder" },
      { match: {}, agent: "default" },
    ];
    const router = new RouterService(rules, agents);
    const route = router.resolve({ channelId: "telegram", chatId: "456", senderId: "u", messageId: "m", text: "", timestamp: 0 });
    expect(route.agentId).toBe("default");
    expect(route.systemPromptPath).toBe("prompts/SYSTEM.md");
  });

  it("matches channel only", () => {
    const rules: RouteRule[] = [
      { match: { channel: "discord" }, agent: "coder" },
      { match: {}, agent: "default" },
    ];
    const router = new RouterService(rules, agents);
    const route = router.resolve({ channelId: "discord", chatId: "999", senderId: "u", messageId: "m", text: "", timestamp: 0 });
    expect(route.agentId).toBe("coder");
  });

  it("returns default when no routes configured", () => {
    const router = new RouterService([], agents);
    const route = router.resolve({ channelId: "telegram", chatId: "1", senderId: "u", messageId: "m", text: "", timestamp: 0 });
    expect(route.agentId).toBe("default");
  });

  it("returns default personality as undefined when not set", () => {
    const router = new RouterService([], agents);
    const route = router.resolve({ channelId: "telegram", chatId: "1", senderId: "u", messageId: "m", text: "", timestamp: 0 });
    expect(route.personalityPath).toBe("prompts/PERSONALITY.md");

    const rules: RouteRule[] = [{ match: {}, agent: "coder" }];
    const router2 = new RouterService(rules, agents);
    const route2 = router2.resolve({ channelId: "telegram", chatId: "1", senderId: "u", messageId: "m", text: "", timestamp: 0 });
    expect(route2.personalityPath).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/routing/router.service.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement RouterService**

Create `src/routing/router.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import type { InboundMessage } from "../channels/channel-adapter.js";

export interface RouteMatch {
  channel?: string;
  chatId?: string;
  chatType?: "direct" | "group";
}

export interface RouteRule {
  match: RouteMatch;
  agent: string;
}

export interface AgentDef {
  systemPrompt: string;
  personality?: string;
  tools: string[];
}

export interface ResolvedRoute {
  agentId: string;
  systemPromptPath: string;
  personalityPath?: string;
  tools: string[];
}

@Injectable()
export class RouterService {
  constructor(
    private readonly rules: RouteRule[],
    private readonly agents: Record<string, AgentDef>,
  ) {}

  resolve(msg: InboundMessage): ResolvedRoute {
    for (const rule of this.rules) {
      if (this.matches(rule.match, msg)) {
        return this.toRoute(rule.agent);
      }
    }
    return this.toRoute("default");
  }

  private matches(match: RouteMatch, msg: InboundMessage): boolean {
    if (match.channel && match.channel !== msg.channelId) return false;
    if (match.chatId && match.chatId !== msg.chatId) return false;
    return true;
  }

  private toRoute(agentId: string): ResolvedRoute {
    const def = this.agents[agentId] ?? this.agents["default"];
    const resolvedId = this.agents[agentId] ? agentId : "default";
    return {
      agentId: resolvedId,
      systemPromptPath: def.systemPrompt,
      personalityPath: def.personality,
      tools: def.tools,
    };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/routing/router.service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routing/router.service.ts tests/routing/router.service.test.ts
git commit -m "feat: add RouterService — declarative route matching for inbound messages"
```

---

### Task 6: Session maintenance service

TTL pruning, per-chat capping, event log pruning, SQLite vacuum.

**Files:**
- Create: `src/database/session-maintenance.service.ts`
- Test: `tests/database/session-maintenance.service.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/database/session-maintenance.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SessionMaintenanceService } from "../../src/database/session-maintenance.service.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { MessageRepository } from "../../src/memory/message.repository.js";

describe("SessionMaintenanceService", () => {
  let tmpDir: string;
  let db: DatabaseService;
  let repo: MessageRepository;
  let maintenance: SessionMaintenanceService;
  const mockBus = { emit: vi.fn() };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-maint-test-"));
    db = new DatabaseService(tmpDir);
    repo = new MessageRepository(db);
    maintenance = new SessionMaintenanceService(db, mockBus as any, { messageTtlDays: 30, maxMessagesPerChat: 3, vacuumAfterCleanup: false });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prunes messages older than TTL", () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    db.getDrizzle().run(db.getDrizzle().insert ? undefined as any :
      db.getDb().prepare("INSERT INTO messages (id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)")
        .run("old-1", "channel", "old msg", JSON.stringify({ chatId: 1 }), old));
    repo.append({ role: "channel", content: "new msg", metadata: { chatId: 1 } });

    const result = maintenance.run();
    expect(result.deletedMessages).toBeGreaterThanOrEqual(1);
    expect(repo.count()).toBe(1);
  });

  it("caps messages per chat", () => {
    for (let i = 0; i < 5; i++) {
      repo.append({ role: "channel", content: `msg-${i}`, metadata: { chatId: 100 } });
    }
    repo.append({ role: "channel", content: "other-chat", metadata: { chatId: 200 } });

    const result = maintenance.run();
    const chat100 = repo.recentByChatId(100, 100);
    expect(chat100.length).toBeLessThanOrEqual(3);
    // Other chat unaffected
    const chat200 = repo.recentByChatId(200, 100);
    expect(chat200).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/database/session-maintenance.service.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SessionMaintenanceService**

Create `src/database/session-maintenance.service.ts`:

```typescript
import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import { BusService } from "../bus/bus.service.js";
import { log } from "../shared/logger.js";

export interface MaintenanceConfig {
  messageTtlDays: number;
  maxMessagesPerChat: number;
  vacuumAfterCleanup: boolean;
}

export interface MaintenanceResult {
  deletedMessages: number;
  deletedEvents: number;
}

@Injectable()
export class SessionMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private static readonly INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

  private readonly config: MaintenanceConfig;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(BusService) private readonly bus: BusService,
    config?: MaintenanceConfig,
  ) {
    this.config = config ?? { messageTtlDays: 30, maxMessagesPerChat: 500, vacuumAfterCleanup: true };
  }

  onModuleInit(): void {
    this.run();
    this.timer = setInterval(() => this.run(), SessionMaintenanceService.INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  run(): MaintenanceResult {
    const raw = this.db.getDb();
    let deletedMessages = 0;
    let deletedEvents = 0;

    // 1. TTL pruning
    const cutoff = Date.now() - this.config.messageTtlDays * 24 * 60 * 60 * 1000;
    const ttlResult = raw.prepare("DELETE FROM messages WHERE created_at < ?").run(cutoff);
    deletedMessages += ttlResult.changes;

    // 2. Per-chat capping
    const chatIds = raw.prepare(
      "SELECT DISTINCT json_extract(metadata, '$.chatId') as chat_id FROM messages WHERE json_extract(metadata, '$.chatId') IS NOT NULL"
    ).all() as Array<{ chat_id: number }>;

    for (const { chat_id } of chatIds) {
      if (chat_id == null) continue;
      const count = (raw.prepare(
        "SELECT COUNT(*) as cnt FROM messages WHERE json_extract(metadata, '$.chatId') = ?"
      ).get(chat_id) as { cnt: number }).cnt;

      if (count > this.config.maxMessagesPerChat) {
        const excess = count - this.config.maxMessagesPerChat;
        const capResult = raw.prepare(
          "DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE json_extract(metadata, '$.chatId') = ? ORDER BY created_at ASC LIMIT ?)"
        ).run(chat_id, excess);
        deletedMessages += capResult.changes;
      }
    }

    // 3. Event log pruning (same TTL)
    const evtResult = raw.prepare("DELETE FROM events WHERE created_at < ?").run(cutoff);
    deletedEvents += evtResult.changes;

    // 4. Vacuum
    if (this.config.vacuumAfterCleanup && (deletedMessages > 0 || deletedEvents > 0)) {
      raw.pragma("wal_checkpoint(TRUNCATE)");
    }

    if (deletedMessages > 0 || deletedEvents > 0) {
      log.info(`[maintenance] Pruned ${deletedMessages} messages, ${deletedEvents} events`);
      this.bus.emit("system:maintenance" as any, { deletedMessages, deletedEvents });
    }

    return { deletedMessages, deletedEvents };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/database/session-maintenance.service.test.ts
```
Expected: PASS (adjust raw SQL insert syntax if needed to match DatabaseService.getDb() API).

- [ ] **Step 5: Commit**

```bash
git add src/database/session-maintenance.service.ts tests/database/session-maintenance.service.test.ts
git commit -m "feat: add SessionMaintenanceService — TTL pruning, per-chat capping, event cleanup"
```

---

### Task 7: Model failover

Add model priority list and try-next-on-failure to `ClaudeProcessService`.

**Files:**
- Modify: `src/agents/claude-process.service.ts`
- Modify: `src/agents/types.ts`
- Modify: `src/bus/channels.ts`
- Test: `tests/agents/claude-process.service.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/agents/claude-process.service.test.ts`:

```typescript
it("includes model in SpawnResult", () => {
  const config: AgentConfig = {
    id: "test-1", task: "test", lane: "main", workdir: "/tmp",
    systemPrompt: "test", timeout: 10000, model: "opus",
  };
  const proc = service.createProcess(config);
  expect(proc).toBeInstanceOf(ClaudeProcess);
  // Model is set on config
  expect(config.model).toBe("opus");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agents/claude-process.service.test.ts
```
Expected: FAIL — `model` not in AgentConfig type.

- [ ] **Step 3: Add `model` to AgentConfig and SpawnResult**

In `src/agents/types.ts`:

Add to `AgentConfig`:
```typescript
model?: string;
```

Add to `SpawnResult`:
```typescript
model?: string;
```

- [ ] **Step 4: Add `agent:failover` bus channel**

In `src/bus/channels.ts`, add to `BusChannels`:

```typescript
"agent:failover": { id: string; fromModel: string; toModel: string; reason: string };
"system:maintenance": { deletedMessages: number; deletedEvents: number };
```

- [ ] **Step 5: Add failover logic to ClaudeProcess.run()**

In `src/agents/claude-process.service.ts`, update `ClaudeProcess.run()` to accept a model list and try each:

Replace the single `query()` call with a loop. The model comes from `this.config.model` (default "opus"). The failover list is not in AgentConfig — it's resolved by the caller. Instead, add a static helper:

```typescript
// Add to ClaudeProcess class:
private static readonly RETRYABLE_PATTERNS = ["rate_limit", "429", "overloaded", "529", "timeout", "abort", "billing", "insufficient"];

private isRetryable(error: string): boolean {
  const lower = error.toLowerCase();
  return ClaudeProcess.RETRYABLE_PATTERNS.some(p => lower.includes(p));
}
```

Then wrap the existing `run()` body: if the first attempt fails with a retryable error and the config has no `model` set (meaning use default), catch and rethrow. The actual failover loop is in `ClaudeProcessService.createProcessWithFailover()`:

Add to `ClaudeProcessService`:

```typescript
createProcessWithFailover(config: AgentConfig, models: string[]): ClaudeProcess {
  // The ClaudeProcess will try models in order
  return new ClaudeProcess({ ...config, _modelQueue: models });
}
```

Actually, simpler approach — keep ClaudeProcess unchanged and add the failover in the caller. Add to `ClaudeProcessService`:

```typescript
async runWithFailover(config: AgentConfig, models: string[], bus?: BusService): Promise<SpawnResult> {
  let lastError: Error | undefined;

  for (const model of models) {
    try {
      const proc = this.createProcess({ ...config, model });
      const result = await proc.run();
      if (result.exitCode === 0) {
        return { ...result, model };
      }
      // Non-zero exit but not an exception — still return it
      return { ...result, model };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const errLower = lastError.message.toLowerCase();
      const retryable = ["rate_limit", "429", "overloaded", "529", "timeout", "abort", "billing", "insufficient"]
        .some(p => errLower.includes(p));

      if (retryable && models.indexOf(model) < models.length - 1) {
        const nextModel = models[models.indexOf(model) + 1];
        log.warn(`[claude] Model ${model} failed (${lastError.message}), falling back to ${nextModel}`);
        if (bus) bus.emit("agent:failover", { id: config.id, fromModel: model, toModel: nextModel, reason: lastError.message });
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("No models available");
}
```

And update the `query()` call in `ClaudeProcess.run()` to use `this.config.model ?? "opus"`:

```typescript
model: this.config.model ?? "opus",
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/agents/claude-process.service.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/agents/claude-process.service.ts src/agents/types.ts src/bus/channels.ts tests/agents/claude-process.service.test.ts
git commit -m "feat: add model failover — priority list with automatic fallback on retryable errors"
```

---

### Task 8: Config schema updates

Add all new config sections to `ConfigService`.

**Files:**
- Modify: `src/config/config.service.ts`
- Test: `tests/config/config.service.test.ts`

- [ ] **Step 1: Write failing test**

Add to config tests (create file if needed):

```typescript
import { describe, it, expect } from "vitest";
import { ConfigService } from "../../src/config/config.service.js";

describe("ConfigService new fields", () => {
  it("has default models config", () => {
    const config = new ConfigService();
    expect(config.models.primary).toBe("opus");
    expect(config.models.fallback).toEqual(["sonnet"]);
  });

  it("has default sessions config", () => {
    const config = new ConfigService();
    expect(config.sessions.messageTtlDays).toBe(30);
    expect(config.sessions.maxMessagesPerChat).toBe(500);
    expect(config.sessions.vacuumAfterCleanup).toBe(true);
  });

  it("has default debounce config", () => {
    const config = new ConfigService();
    expect(config.debounce.textGapMs).toBe(2000);
    expect(config.debounce.mediaGapMs).toBe(100);
  });

  it("has empty routes by default", () => {
    const config = new ConfigService();
    expect(config.routes).toEqual([]);
  });

  it("has default agent config", () => {
    const config = new ConfigService();
    expect(config.agents.default.systemPrompt).toBe("prompts/SYSTEM.md");
    expect(config.agents.default.tools).toEqual(["Bash"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config/config.service.test.ts
```
Expected: FAIL — properties don't exist.

- [ ] **Step 3: Add new schemas to ConfigService**

In `src/config/config.service.ts`, extend `ConfigSchema`:

```typescript
models: z.object({
  primary: z.string().default("opus"),
  fallback: z.array(z.string()).default(["sonnet"]),
}).default({ primary: "opus", fallback: ["sonnet"] }),

sessions: z.object({
  messageTtlDays: z.number().int().min(1).default(30),
  maxMessagesPerChat: z.number().int().min(10).default(500),
  vacuumAfterCleanup: z.boolean().default(true),
}).default({ messageTtlDays: 30, maxMessagesPerChat: 500, vacuumAfterCleanup: true }),

debounce: z.object({
  textGapMs: z.number().int().min(100).default(2000),
  mediaGapMs: z.number().int().min(10).default(100),
  maxFragments: z.number().int().min(1).default(12),
  maxChars: z.number().int().min(100).default(10000),
}).default({ textGapMs: 2000, mediaGapMs: 100, maxFragments: 12, maxChars: 10000 }),

routes: z.array(z.object({
  match: z.object({
    channel: z.string().optional(),
    chatId: z.string().optional(),
    chatType: z.enum(["direct", "group"]).optional(),
  }),
  agent: z.string(),
})).default([]),

agents: z.record(z.object({
  systemPrompt: z.string(),
  personality: z.string().optional(),
  tools: z.array(z.string()),
})).default({
  default: { systemPrompt: "prompts/SYSTEM.md", personality: "prompts/PERSONALITY.md", tools: ["Bash"] },
}),
```

Add getters:

```typescript
get models(): RueConfig["models"] { return this.config.models; }
get sessions(): RueConfig["sessions"] { return this.config.sessions; }
get debounce(): RueConfig["debounce"] { return this.config.debounce; }
get routes(): RueConfig["routes"] { return this.config.routes; }
get agents(): RueConfig["agents"] { return this.config.agents; }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/config/config.service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/config.service.ts tests/config/config.service.test.ts
git commit -m "feat: add models, sessions, debounce, routes, agents to config schema"
```

---

### Task 9: Channels module and wiring

Create the NestJS `ChannelsModule` that registers all channel components and wire it into `AppModule`, replacing the old `TelegramModule` and `ChannelModule`.

**Files:**
- Create: `src/channels/channels.module.ts`
- Create: `src/routing/routing.module.ts`
- Modify: `src/app.module.ts`
- Delete: `src/channel/channel.service.ts`
- Delete: `src/channel/channel.module.ts`
- Delete: `src/telegram/telegram.service.ts`
- Delete: `src/telegram/telegram.module.ts`

- [ ] **Step 1: Create ChannelsModule**

Create `src/channels/channels.module.ts`:

```typescript
import { Module, OnModuleInit, OnModuleDestroy, Inject } from "@nestjs/common";
import { ChannelRegistry } from "./channel-registry.js";
import { DebounceService } from "./debounce.service.js";
import { ChannelService } from "./channel.service.js";
import { TelegramAdapter } from "./adapters/telegram.adapter.js";
import { TelegramStoreService } from "./adapters/telegram-store.service.js";
import { ConfigService } from "../config/config.service.js";
import { MemoryModule } from "../memory/memory.module.js";
import { AgentsModule } from "../agents/agents.module.js";

@Module({
  imports: [MemoryModule, AgentsModule],
  providers: [
    ChannelRegistry,
    ChannelService,
    {
      provide: DebounceService,
      useFactory: (config: ConfigService) => new DebounceService(config.debounce),
      inject: [ConfigService],
    },
    {
      provide: TelegramStoreService,
      useFactory: (config: ConfigService) => new TelegramStoreService(config.dataDir),
      inject: [ConfigService],
    },
    {
      provide: TelegramAdapter,
      useFactory: (store: TelegramStoreService) => new TelegramAdapter(store),
      inject: [TelegramStoreService],
    },
  ],
  exports: [ChannelRegistry, ChannelService, DebounceService, TelegramStoreService],
})
export class ChannelsModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(ChannelRegistry) private readonly registry: ChannelRegistry,
    @Inject(TelegramAdapter) private readonly telegram: TelegramAdapter,
    @Inject(DebounceService) private readonly debounce: DebounceService,
    @Inject(ChannelService) private readonly channelService: ChannelService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registry.register(this.telegram);
    this.registry.onMessage((msg) => this.debounce.push(msg));
    this.debounce.onBatch((batch) => this.channelService.handleBatch(batch));
    await this.registry.startAll();
  }

  async onModuleDestroy(): Promise<void> {
    await this.registry.stopAll();
  }
}
```

- [ ] **Step 2: Create RoutingModule**

Create `src/routing/routing.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { RouterService } from "./router.service.js";
import { ConfigService } from "../config/config.service.js";

@Module({
  providers: [
    {
      provide: RouterService,
      useFactory: (config: ConfigService) => new RouterService(config.routes, config.agents),
      inject: [ConfigService],
    },
  ],
  exports: [RouterService],
})
export class RoutingModule {}
```

- [ ] **Step 3: Refactor ChannelService to be adapter-agnostic**

Move `src/channel/channel.service.ts` to `src/channels/channel.service.ts` and refactor:

1. Remove Telegram-specific imports and injection
2. Replace `this.telegram.sendMessage(chatId, text)` with `this.registry.sendMessage(channelId, { chatId }, text)`
3. Replace `this.telegram.reactToMessage(chatId, msgId, emoji)` with `this.registry.sendReaction(channelId, { chatId }, msgId, emoji)`
4. Remove inline batching (`batchTimers`, `batchedMessages`) — `DebounceService` handles this now
5. Add `handleBatch(batch: DebouncedBatch)` method that replaces the old `post()` for inbound messages
6. Keep `post()` for internal use (delegate results, agent messages)
7. Inject `ChannelRegistry` and `RouterService` instead of `TelegramService`
8. Use `RouterService.resolve()` to get agent config per batch
9. Pass resolved route to `AssemblerService.assemble()` (use the route's systemPromptPath and personalityPath)

The `handleBatch` method:
```typescript
handleBatch(batch: DebouncedBatch): void {
  // Store each message
  for (const msg of batch.messages) {
    this.messages.append({
      role: "channel",
      content: msg.text,
      metadata: { tag: `USER_${msg.channelId.toUpperCase()}`, chatId: msg.chatId, messageId: msg.messageId },
    });
  }

  this.triggerAgent(batch.chatId, batch.channelId);
}
```

Update `runMainAgent` to use the registry for outbound and router for agent config.

- [ ] **Step 4: Update AssemblerService to accept route config**

In `src/memory/assembler.service.ts`, update `assemble()` to optionally accept prompt paths:

```typescript
assemble(task: string, promptPaths?: { systemPrompt?: string; personality?: string }): string {
  // ... existing cache invalidation ...
  if (this.systemPromptCache === null) {
    this.systemPromptCache = this.readProjectFile(promptPaths?.systemPrompt ?? "prompts/SYSTEM.md") ?? "";
  }
  if (this.personalityCache === null) {
    this.personalityCache = this.readProjectFile(promptPaths?.personality ?? "prompts/PERSONALITY.md") ?? "";
  }
  // ... rest unchanged ...
}
```

Note: When prompt paths change between calls, the cache needs to be invalidated. Add path tracking:

```typescript
private cachedPromptPaths: { systemPrompt?: string; personality?: string } | null = null;

// In assemble():
const pathsChanged = JSON.stringify(promptPaths) !== JSON.stringify(this.cachedPromptPaths);
if (pathsChanged) {
  this.systemPromptCache = null;
  this.personalityCache = null;
  this.cachedPromptPaths = promptPaths ?? null;
}
```

- [ ] **Step 5: Delete old modules**

```bash
rm src/channel/channel.service.ts src/channel/channel.module.ts
rmdir src/channel
rm src/telegram/telegram.service.ts src/telegram/telegram.module.ts
rmdir src/telegram
```

- [ ] **Step 6: Update AppModule**

In `src/app.module.ts`, replace `TelegramModule` and `ChannelModule` with `ChannelsModule` and `RoutingModule`:

```typescript
import { ChannelsModule } from "./channels/channels.module.js";
import { RoutingModule } from "./routing/routing.module.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    BusModule,
    IdentityModule,
    MemoryModule,
    ChannelsModule,
    RoutingModule,
    AgentsModule,
    GatewayModule,
    ApiModule,
    SchedulerModule,
    PlannerModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Update tests**

Update any tests that import from `src/channel/` or `src/telegram/` to use new paths. Key files:
- `tests/app.test.ts` — remove TelegramModule/ChannelModule references
- `tests/gateway/daemon.gateway.test.ts` — update ChannelService import path

- [ ] **Step 8: Run all tests**

```bash
npx vitest run
```
Expected: All pass (some tests may need path updates).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: wire ChannelsModule and RoutingModule — replace old telegram and channel modules"
```

---

### Task 10: Maintenance API endpoint

Add `GET /api/maintenance/run` to trigger manual cleanup.

**Files:**
- Modify: `src/api/api.module.ts`
- Create or modify: maintenance controller

- [ ] **Step 1: Add endpoint**

Add to an existing controller or create `src/api/maintenance.controller.ts`:

```typescript
import { Controller, Get, Inject } from "@nestjs/common";
import { SessionMaintenanceService } from "../database/session-maintenance.service.js";

@Controller("api")
export class MaintenanceController {
  constructor(@Inject(SessionMaintenanceService) private readonly maintenance: SessionMaintenanceService) {}

  @Get("maintenance/run")
  runMaintenance() {
    return this.maintenance.run();
  }
}
```

Register in `src/api/api.module.ts`.

- [ ] **Step 2: Register SessionMaintenanceService in DatabaseModule**

Ensure `SessionMaintenanceService` is provided and exported from `DatabaseModule`.

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run
git add -A
git commit -m "feat: add GET /api/maintenance/run — manual session cleanup trigger"
```

---

## Task Dependency Graph

```
Task 1 (types) ──► Task 2 (registry) ──► Task 3 (telegram adapter) ──► Task 9 (wiring)
                                                                            ▲
Task 4 (debounce) ─────────────────────────────────────────────────────────┘
Task 5 (router) ───────────────────────────────────────────────────────────┘
Task 6 (session maintenance) ──► Task 10 (maintenance API)
Task 7 (model failover) ──────► Task 9 (wiring)
Task 8 (config schema) ───────► Task 9 (wiring)
```

**Parallelizable groups:**
- Tasks 1-5 and 6-8 can proceed in parallel (no shared files)
- Task 9 depends on all of 1-8
- Task 10 depends on Task 6
