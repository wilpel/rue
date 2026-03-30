# NestJS Agents & Transport Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AgentsModule (ClaudeProcess, Supervisor, LaneQueue, Health, Delegate), unified message inbox, WebSocket Gateway, REST API controllers, and TelegramModule on top of Plan 1's foundation.

**Architecture:** All messages (user input, delegate results, scheduler outputs) flow through a single `InboxService` with source tagging. The main agent processes inbox items and uses skills to respond. WebSocket gateway handles real-time streaming. REST controllers handle CRUD operations.

**Tech Stack:** NestJS 11, @nestjs/websockets, @nestjs/platform-ws, Claude Agent SDK, Telegraf, Vitest

**Depends on:** Plan 1 (ConfigModule, DatabaseModule, BusModule, IdentityModule, MemoryModule)

---

## Key Design: Unified Inbox

All inputs to the main agent go through `InboxService`:

```
[User via Telegram] "Find apartments in Södermalm"
[User via WebSocket] "Check status"
[Delegate delegate-123] "Found 3 apartments: ..."
[Scheduler job-xyz] "Daily apartment check results: ..."
```

The main agent sees these as a stream of tagged messages. It decides how to respond — including which channel to reply on.

```
InboxService
├── push(source, content, metadata)     // any source pushes here
├── onMessage(handler)                   // main agent subscribes
└── Messages stored in MessageRepository with source metadata
```

When a delegate finishes, instead of sending directly to Telegram, it pushes to the inbox. The main agent then sees it, formats a response, and uses the telegram skill to send it.

---

### Task 1: InboxService — unified message queue

**Files:**
- Create: `src/inbox/inbox.service.ts`
- Create: `src/inbox/inbox.module.ts`
- Create: `tests/inbox/inbox.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/inbox/inbox.service.test.ts
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

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-inbox-test-"));
    dbService = new DatabaseService(tmpDir);
    const messageRepo = new MessageRepository(dbService);
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
    const repo = new MessageRepository(dbService);
    const recent = repo.recent(1);
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
  });

  it("unsubscribes handler", () => {
    const handler = vi.fn();
    const unsub = inbox.onMessage(handler);
    unsub();
    inbox.push("telegram", "Should not fire", {});
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/inbox/inbox.service.test.ts
```

- [ ] **Step 3: Implement InboxService**

```typescript
// src/inbox/inbox.service.ts
import { Injectable } from "@nestjs/common";
import { MessageRepository } from "../memory/message.repository.js";
import { BusService } from "../bus/bus.service.js";

export interface InboxMessage {
  id: string;
  source: string;
  content: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

type MessageHandler = (message: InboxMessage) => void;

@Injectable()
export class InboxService {
  private handlers = new Set<MessageHandler>();

  constructor(
    private readonly messages: MessageRepository,
    private readonly bus: BusService,
  ) {}

  push(source: string, content: string, metadata: Record<string, unknown>): InboxMessage {
    const stored = this.messages.append({
      role: source === "delegate" || source === "scheduler" ? "push" : "user",
      content,
      metadata: { ...metadata, source },
    });

    const inboxMsg: InboxMessage = {
      id: stored.id,
      source,
      content,
      metadata: { ...metadata, source },
      timestamp: stored.createdAt,
    };

    this.bus.emit("message:created", {
      id: stored.id,
      role: stored.role,
      content,
      timestamp: stored.createdAt,
      metadata: { ...metadata, source },
    });

    for (const handler of this.handlers) {
      handler(inboxMsg);
    }

    return inboxMsg;
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  formatPrefix(source: string): string {
    switch (source) {
      case "telegram": return "[User via Telegram]";
      case "websocket": return "[User via CLI]";
      case "delegate": return "[Sub-Agent]";
      case "scheduler": return "[Scheduled Job]";
      default: return `[${source}]`;
    }
  }
}
```

- [ ] **Step 4: Create InboxModule**

```typescript
// src/inbox/inbox.module.ts
import { Module } from "@nestjs/common";
import { InboxService } from "./inbox.service.js";
import { MemoryModule } from "../memory/memory.module.js";

@Module({
  imports: [MemoryModule],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
```

- [ ] **Step 5: Run test**

```bash
npx vitest run tests/inbox/inbox.service.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/inbox/ tests/inbox/
git commit -m "feat: InboxService — unified message queue with source tagging"
```

---

### Task 2: AgentsModule — ClaudeProcess, LaneQueue, Supervisor, Health

**Files:**
- Create: `src/agents/claude-process.service.ts`
- Create: `src/agents/lane-queue.service.ts`
- Create: `src/agents/supervisor.service.ts`
- Create: `src/agents/health.service.ts`
- Create: `src/agents/agents.module.ts`
- Create: `tests/agents/claude-process.service.test.ts`
- Create: `tests/agents/lane-queue.service.test.ts`
- Create: `tests/agents/supervisor.service.test.ts`
- Create: `tests/agents/health.service.test.ts`

This is a large task. Port the existing agent code into NestJS injectable services. The key changes:
- ClaudeProcessService wraps SDK `query()` with AbortController + timeout
- LaneQueueService manages per-lane concurrency
- SupervisorService tracks agents in a Map, delegates to lanes
- HealthService polls for stalled agents

Existing code to port from:
- `src/agents/process.ts` → `src/agents/claude-process.service.ts`
- `src/agents/lanes.ts` → `src/agents/lane-queue.service.ts`
- `src/agents/supervisor.ts` → `src/agents/supervisor.service.ts`
- `src/agents/health.ts` → `src/agents/health.service.ts`

Each service should be `@Injectable()` and use constructor injection for dependencies (BusService, ConfigService, etc.).

---

### Task 3: DelegateService — background agents pushing to inbox

**Files:**
- Create: `src/agents/delegate.service.ts`
- Create: `tests/agents/delegate.service.test.ts`

The delegate service spawns background Claude queries and pushes results to InboxService instead of sending directly to Telegram. The main agent then processes the inbox message.

Key changes from old code:
- `spawnDelegatedTask()` → on completion, calls `inbox.push("delegate", result, { agentId, task, chatId })`
- Activity tracking stays (tool usage log)
- Timeout + AbortController stays
- NO direct Telegram sending — that's the main agent's job now

---

### Task 4: GatewayModule — WebSocket real-time streaming

**Files:**
- Create: `src/gateway/daemon.gateway.ts`
- Create: `src/gateway/protocol.ts` (port existing Zod schemas)
- Create: `src/gateway/gateway.module.ts`
- Create: `tests/gateway/daemon.gateway.test.ts`

Port the WebSocket handler from `src/daemon/handler.ts` into a NestJS `@WebSocketGateway()`. Key behaviors:
- `cmd:ask` → assembles prompt, runs ClaudeProcess, streams chunks, pushes to inbox on completion
- `cmd:status` → returns agent list
- `cmd:history` → returns recent messages
- `cmd:reset` → clears session
- `subscribe` → subscribe to bus events, cleanup on disconnect
- AbortController tracking per connection, cleanup on close

---

### Task 5: ApiModule — REST controllers

**Files:**
- Create: `src/api/status.controller.ts`
- Create: `src/api/projects.controller.ts`
- Create: `src/api/delegates.controller.ts`
- Create: `src/api/secrets.controller.ts`
- Create: `src/api/history.controller.ts`
- Create: `src/api/api.module.ts`
- Create: `tests/api/status.controller.test.ts`
- Create: `tests/api/delegates.controller.test.ts`

Port REST endpoints from the monolithic `handleHttpRequest()` in server.ts into proper NestJS controllers with `@Get()`, `@Post()`, `@Delete()` decorators.

---

### Task 6: TelegramModule — bot integration pushing to inbox

**Files:**
- Create: `src/telegram/telegram.service.ts`
- Create: `src/telegram/telegram-store.service.ts`
- Create: `src/telegram/telegram.module.ts`
- Create: `tests/telegram/telegram.service.test.ts`

Port Telegraf bot from `src/interfaces/telegram/bot.ts`. Key changes:
- On message received → `inbox.push("telegram", text, { chatId, messageId })`
- Bot no longer runs its own SDK queries — it just pushes to inbox
- Main agent processes the inbox message and uses delegate skill or responds directly
- Streaming response delivery stays (8s burst flush)

---

### Task 7: Wire all modules into AppModule

**Files:**
- Modify: `src/app.module.ts`
- Modify: `src/main.ts`
- Create: `tests/integration/nestjs-smoke.test.ts`

Add InboxModule, AgentsModule, GatewayModule, ApiModule, TelegramModule to AppModule. Update main.ts to start Telegram bot on launch. Integration test: boot app, send WS message, verify inbox receives it.

---

### Task 8: Full test suite and type check

- Run all new + existing tests
- Verify `tsc --noEmit` clean
- Final commit on feature branch

---

## Summary

| Task | Module | Tests |
|------|--------|-------|
| 1 | InboxModule | 6 |
| 2 | AgentsModule (4 services) | ~20 |
| 3 | DelegateService | ~6 |
| 4 | GatewayModule | ~8 |
| 5 | ApiModule (5 controllers) | ~10 |
| 6 | TelegramModule | ~6 |
| 7 | Integration wiring | ~2 |
| 8 | Full verification | — |
