# Architecture Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up architectural issues identified in the architecture review — eliminate duplication, fix concurrency bypass, centralize session state, add budget enforcement, and improve error handling.

**Architecture:** Consolidate all SDK calls through `ClaudeProcessService`, remove the orphaned inbox module, route delegates through the supervisor's lane queue, centralize session management in a new `SessionService`, and add a `BudgetService` that enforces daily cost ceilings.

**Tech Stack:** TypeScript, NestJS 11, Claude Agent SDK, Drizzle ORM / better-sqlite3, Vitest

---

### Task 1: Remove orphaned inbox module

The inbox module (`InboxService`, `InboxProcessorService`, `InboxModule`) is not imported by `AppModule` and is fully superseded by `ChannelService`. Remove the dead code and update any test files that reference it.

**Files:**
- Delete: `src/inbox/inbox.service.ts`
- Delete: `src/inbox/inbox-processor.service.ts`
- Delete: `src/inbox/inbox.module.ts`
- Delete: `tests/inbox/inbox.service.test.ts`
- Delete: `tests/inbox/inbox-processor.service.test.ts`
- Modify: `tests/agents/delegate.service.test.ts` (remove inbox mock references)
- Modify: `tests/gateway/daemon.gateway.test.ts` (remove inbox mock references)

- [ ] **Step 1: Verify inbox is not imported anywhere in src/**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass (baseline).

Then verify no src/ imports:
```bash
grep -r "inbox" src/ --include="*.ts" -l
```
Expected: No files outside `src/inbox/` reference it.

- [ ] **Step 2: Delete inbox source files**

```bash
rm src/inbox/inbox.service.ts src/inbox/inbox-processor.service.ts src/inbox/inbox.module.ts
rmdir src/inbox
```

- [ ] **Step 3: Delete inbox test files**

```bash
rm tests/inbox/inbox.service.test.ts tests/inbox/inbox-processor.service.test.ts
rmdir tests/inbox
```

- [ ] **Step 4: Update delegate.service.test.ts — remove inbox references**

The delegate test currently mocks `InboxService` and asserts `inbox.push()` calls. Since delegates now post to `ChannelService`, update the test to mock the channel reference instead.

Replace the `InboxService` mock setup and assertions with `channelServiceRef` setup. The test should verify that `channelServiceRef.post()` is called with the correct tag, content, and chatId on completion.

Read the current test file first to see exact mock structure, then:
- Remove any `InboxService` import and mock
- Ensure the test calls `delegate.setChannelService(mockChannel)` in `beforeEach`
- Update assertions from `inbox.push(...)` to verify the channel post was called

- [ ] **Step 5: Update daemon.gateway.test.ts — remove inbox references**

Read the current test, remove any `InboxService` mock from the constructor injection. The gateway doesn't use inbox — this is a stale mock parameter.

- [ ] **Step 6: Run tests**

```bash
npx vitest run
```
Expected: All tests pass with no inbox references remaining.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove orphaned inbox module — fully replaced by channel system"
```

---

### Task 2: Add `MessageRole` type to include "channel" role

The `MessageRepository` defines `MessageRole` as `"user" | "assistant" | "system" | "agent-event" | "push"` but `ChannelService` stores messages with `role: "channel" as any`. Fix the type.

**Files:**
- Modify: `src/memory/message.repository.ts`
- Test: `tests/memory/message.repository.test.ts`

- [ ] **Step 1: Write failing test for channel role**

Add to `tests/memory/message.repository.test.ts`:

```typescript
it("stores messages with channel role", () => {
  repo.append({ role: "channel", content: "test", metadata: { tag: "USER_TELEGRAM", chatId: 123 } });
  const msgs = repo.recent(1);
  expect(msgs).toHaveLength(1);
  expect(msgs[0].role).toBe("channel");
  expect(msgs[0].metadata?.tag).toBe("USER_TELEGRAM");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/memory/message.repository.test.ts
```
Expected: TypeScript compilation error — "channel" not assignable to MessageRole.

- [ ] **Step 3: Add "channel" to MessageRole**

In `src/memory/message.repository.ts`, update the type:

```typescript
export type MessageRole = "user" | "assistant" | "system" | "agent-event" | "push" | "channel";
```

- [ ] **Step 4: Remove `as any` casts in ChannelService**

In `src/channel/channel.service.ts`, remove the `as any` casts on both `role: "channel"` lines (around lines 58 and 142).

Change:
```typescript
role: "channel" as any,
```
To:
```typescript
role: "channel",
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/memory/message.repository.ts src/channel/channel.service.ts tests/memory/message.repository.test.ts
git commit -m "fix: add 'channel' to MessageRole — remove as-any casts"
```

---

### Task 3: Add `recentByChatId` to MessageRepository

`ChannelService.getHistory()` fetches `recent(limit * 2)` then filters in JS. Add a SQL-level filter.

**Files:**
- Modify: `src/memory/message.repository.ts`
- Modify: `src/channel/channel.service.ts`
- Test: `tests/memory/message.repository.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/memory/message.repository.test.ts`:

```typescript
it("recentByChatId filters by chatId at SQL level", () => {
  repo.append({ role: "channel", content: "msg1", metadata: { chatId: 100, tag: "USER_TELEGRAM" } });
  repo.append({ role: "channel", content: "msg2", metadata: { chatId: 200, tag: "USER_TELEGRAM" } });
  repo.append({ role: "channel", content: "msg3", metadata: { chatId: 100, tag: "AGENT_RUE" } });

  const chat100 = repo.recentByChatId(100, 10);
  expect(chat100).toHaveLength(2);
  expect(chat100[0].content).toBe("msg1");
  expect(chat100[1].content).toBe("msg3");

  const chat200 = repo.recentByChatId(200, 10);
  expect(chat200).toHaveLength(1);
  expect(chat200[0].content).toBe("msg2");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/memory/message.repository.test.ts
```
Expected: FAIL — `recentByChatId` is not a function.

- [ ] **Step 3: Implement `recentByChatId`**

Add to `src/memory/message.repository.ts`:

```typescript
recentByChatId(chatId: number, limit = 20): StoredMessage[] {
  const rows = this.db.all<RawRow>(
    `SELECT * FROM messages WHERE json_extract(metadata, '$.chatId') = ? ORDER BY created_at ASC LIMIT ?`,
    chatId,
    limit,
  );
  return rows.map(r => this.toStored(r));
}
```

Note: `this.db.all` uses the raw better-sqlite3 `all()` method added in `DatabaseService`. If the repository uses Drizzle, use the equivalent Drizzle `sql` query. Read the current `recent()` implementation to match the pattern.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/memory/message.repository.test.ts
```
Expected: All pass.

- [ ] **Step 5: Update ChannelService.getHistory to use recentByChatId**

In `src/channel/channel.service.ts`, replace the `getHistory` method:

```typescript
getHistory(chatId: number, limit = 20): string {
  const chatMessages = this.messages.recentByChatId(chatId, limit);

  if (chatMessages.length === 0) return "(No conversation history)";

  return chatMessages.map(m => {
    const tag = (m.metadata as Record<string, unknown>)?.tag ?? (m.role === "assistant" ? "AGENT_RUE" : "USER_TELEGRAM");
    return `[${tag}] ${m.content}`;
  }).join("\n");
}
```

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/memory/message.repository.ts src/channel/channel.service.ts tests/memory/message.repository.test.ts
git commit -m "feat: add recentByChatId to MessageRepository — SQL-level chat filtering"
```

---

### Task 4: Consolidate SDK query calls into ClaudeProcessService

`ChannelService` and `DaemonGateway` each have ~70-line inline SDK query loops. Refactor both to use `ClaudeProcessService.createProcess()` with `onOutput` callbacks for streaming.

**Files:**
- Modify: `src/agents/claude-process.service.ts`
- Modify: `src/channel/channel.service.ts`
- Modify: `src/gateway/daemon.gateway.ts`
- Modify: `src/agents/types.ts`
- Test: `tests/agents/claude-process.service.test.ts`

- [ ] **Step 1: Write failing test for session ID in SpawnResult**

`ClaudeProcess.run()` already returns `sessionId` in `SpawnResult`. Verify the test covers this. Add to `tests/agents/claude-process.service.test.ts`:

```typescript
it("createProcess accepts config with resume option", () => {
  const config: AgentConfig = {
    id: "test-1",
    task: "test task",
    lane: "main",
    workdir: "/tmp",
    systemPrompt: "test",
    timeout: 10000,
    resume: "session-abc",
  };
  const proc = service.createProcess(config);
  expect(proc).toBeInstanceOf(ClaudeProcess);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agents/claude-process.service.test.ts
```
Expected: FAIL — `resume` not in AgentConfig type.

- [ ] **Step 3: Add `resume` field to AgentConfig**

In `src/agents/types.ts`, add to the `AgentConfig` interface:

```typescript
resume?: string; // Session ID for resuming conversations
```

- [ ] **Step 4: Wire `resume` in ClaudeProcess.run()**

In `src/agents/claude-process.service.ts`, in the `run()` method, update the `query()` options to include resume:

```typescript
const q = query({
  prompt: this.config.task,
  options: {
    cwd: this.config.workdir,
    systemPrompt: this.config.systemPrompt,
    tools: { type: "preset", preset: "claude_code" },
    allowedTools: this.config.allowedTools ?? ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    maxTurns: this.config.maxTurns,
    maxBudgetUsd: this.config.budget,
    abortController: this.abortController,
    includePartialMessages: true,
    settingSources: [],
    ...(this.config.resume ? { resume: this.config.resume } : {}),
  },
});
```

Note: Also add `settingSources: []` if not already present (matching the pattern from channel/gateway).

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/agents/claude-process.service.test.ts
```
Expected: All pass.

- [ ] **Step 6: Refactor ChannelService to use ClaudeProcessService**

In `src/channel/channel.service.ts`:

1. Add `ClaudeProcessService` to constructor injection
2. Replace the entire `runClaudeQuery` method with:

```typescript
private async runClaudeQuery(
  prompt: string,
  systemPrompt: string,
  resumeSessionId?: string,
): Promise<{ output: string; sessionId?: string }> {
  const proc = this.processService.createProcess({
    id: `channel-${Date.now()}`,
    task: prompt,
    lane: "main",
    workdir: process.cwd(),
    systemPrompt,
    timeout: 60_000,
    maxTurns: 4,
    allowedTools: ["Bash"],
    resume: resumeSessionId,
  });

  const result = await proc.run();
  return { output: result.output, sessionId: result.sessionId };
}
```

3. Remove the SDK-related imports (`SDKSystemMessage`, `SDKStreamEvent`, etc.) from channel.service.ts.

- [ ] **Step 7: Refactor DaemonGateway to use ClaudeProcessService**

In `src/gateway/daemon.gateway.ts`:

1. Add `ClaudeProcessService` to constructor injection
2. In the `ask` command handler, replace the inline SDK loop:

```typescript
case "ask": {
  const text = frame.args.text as string;
  log.info(`[gateway] ask: "${text.slice(0, 60)}"`);
  const systemPrompt = this.assembler.assemble(text);
  this.messages.append({ role: "user", content: text });

  try {
    const existingSession = sessionMap.get(ws) ?? (Date.now() - lastSessionTime < 1800_000 ? lastSessionId : undefined);

    const proc = this.processService.createProcess({
      id: `gateway-${Date.now()}`,
      task: text,
      lane: "main",
      workdir: process.cwd(),
      systemPrompt,
      timeout: DaemonGateway.QUERY_TIMEOUT_MS,
      maxTurns: 3,
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
      resume: existingSession,
    });

    const abortController = proc.abortController;
    if (abortController) this.trackAbort(ws, abortController);

    proc.onOutput((chunk) => {
      send({ type: "stream", agentId: "main", chunk });
    });

    const result = await proc.run();

    if (abortController) this.untrackAbort(ws, abortController);

    if (result.sessionId) {
      sessionMap.set(ws, result.sessionId);
      lastSessionId = result.sessionId;
      lastSessionTime = Date.now();
    }

    const cleanedText = result.output.replace(/\[no_?response\]/gi, "").trim();
    if (cleanedText) {
      this.messages.append({ role: "assistant", content: cleanedText });
    }
    send({ type: "result", id: frame.id, data: { output: cleanedText, cost: result.cost } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`[gateway] SDK error: ${message}`);
    send({ type: "error", id: frame.id, code: "SDK_ERROR", message });
  }
  break;
}
```

3. To support the gateway's abort tracking, expose the `AbortController` from `ClaudeProcess`. Add a public getter:

In `src/agents/claude-process.service.ts`, add:
```typescript
get abort(): AbortController | null { return this.abortController; }
```

And update the gateway to use `proc.abort` instead of creating its own.

4. Remove SDK-related imports from daemon.gateway.ts.

- [ ] **Step 8: Run all tests**

```bash
npx vitest run
```
Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add src/agents/claude-process.service.ts src/agents/types.ts src/channel/channel.service.ts src/gateway/daemon.gateway.ts tests/agents/claude-process.service.test.ts
git commit -m "refactor: consolidate SDK calls — channel and gateway now use ClaudeProcessService"
```

---

### Task 5: Route delegates through supervisor and lane queue

`DelegateService` bypasses `LaneQueueService` entirely. Refactor it to spawn through `SupervisorService`, which enforces lane concurrency.

**Files:**
- Modify: `src/agents/delegate.service.ts`
- Modify: `src/agents/supervisor.service.ts`
- Test: `tests/agents/delegate.service.test.ts`
- Test: `tests/agents/supervisor.service.test.ts`

- [ ] **Step 1: Write failing test — delegate respects lane concurrency**

Add to `tests/agents/delegate.service.test.ts`:

```typescript
it("spawns delegate through supervisor", async () => {
  await delegate.spawn("do work", 123);
  expect(mockSupervisor.spawn).toHaveBeenCalledWith(
    expect.objectContaining({
      task: "do work",
      lane: "sub",
      maxTurns: 25,
    }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agents/delegate.service.test.ts
```
Expected: FAIL — mockSupervisor not defined (delegate currently uses ClaudeProcessService directly).

- [ ] **Step 3: Refactor DelegateService to use SupervisorService**

Replace `ClaudeProcessService` injection with `SupervisorService`. The `spawn` method becomes:

```typescript
async spawn(task: string, chatId: number, messageId?: number): Promise<void> {
  const agentId = `delegate-${Date.now()}`;
  const info: DelegateInfo = {
    id: agentId,
    task,
    status: "running",
    startedAt: Date.now(),
    activity: [],
    chatId,
    messageId,
  };
  this.delegates.set(agentId, info);

  const systemPrompt = `You are a background worker agent for Rue. Complete the given task thoroughly using your tools. Output ONLY the final answer/result. Be concise but complete. Format for Telegram (plain text).`;

  try {
    const result = await this.supervisor.spawn({
      task,
      lane: "sub",
      workdir: process.cwd(),
      systemPrompt,
      timeout: DelegateService.TIMEOUT_MS,
      maxTurns: 25,
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"],
    });

    info.status = "completed";
    info.result = result.output;

    if (result.output.trim() && channelServiceRef) {
      channelServiceRef.post(`AGENT_DELEGATE_${agentId}`, result.output.trim(), chatId);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`[delegate] Agent ${agentId} failed: ${errMsg}`);
    info.status = "failed";
    info.result = errMsg;

    if (channelServiceRef) {
      channelServiceRef.post(`AGENT_DELEGATE_${agentId}`, `Failed: ${errMsg}`, chatId);
    }
  } finally {
    setTimeout(() => this.delegates.delete(agentId), 600_000);
  }
}
```

Remove: the custom abort/Promise.race logic, direct `ClaudeProcessService` usage, manual `HealthService` track/untrack calls (supervisor handles these), and manual bus event emissions (supervisor emits `agent:spawned`, `agent:completed`, `agent:failed`).

Update constructor to inject `SupervisorService` instead of `ClaudeProcessService` and `HealthService`:

```typescript
constructor(
  @Inject(SupervisorService) private readonly supervisor: SupervisorService,
) {}
```

Remove `BusService` and `HealthService` imports — the supervisor handles both.

- [ ] **Step 4: Update delegate tests**

Rewrite `tests/agents/delegate.service.test.ts` to mock `SupervisorService` instead of `ClaudeProcessService`, `BusService`, and `HealthService`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DelegateService } from "../../src/agents/delegate.service.js";

describe("DelegateService", () => {
  let delegate: DelegateService;
  const mockSupervisor = { spawn: vi.fn() };
  const mockChannel = { post: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    delegate = new DelegateService(mockSupervisor as any);
    delegate.setChannelService(mockChannel as any);
    mockSupervisor.spawn.mockResolvedValue({ output: "result text", cost: 0.05 });
  });

  it("spawns delegate through supervisor with sub lane", async () => {
    await delegate.spawn("search the web", 123);
    expect(mockSupervisor.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ task: "search the web", lane: "sub", maxTurns: 25 }),
    );
  });

  it("posts result to channel on completion", async () => {
    await delegate.spawn("find info", 456);
    expect(mockChannel.post).toHaveBeenCalledWith(
      expect.stringContaining("AGENT_DELEGATE_"),
      "result text",
      456,
    );
  });

  it("tracks delegate in list", async () => {
    const promise = delegate.spawn("task", 123);
    expect(delegate.listDelegates()).toHaveLength(1);
    expect(delegate.listDelegates()[0].status).toBe("running");
    await promise;
    expect(delegate.listDelegates()[0].status).toBe("completed");
  });

  it("posts failure to channel on error", async () => {
    mockSupervisor.spawn.mockRejectedValue(new Error("timeout"));
    await delegate.spawn("task", 123);
    expect(mockChannel.post).toHaveBeenCalledWith(
      expect.stringContaining("AGENT_DELEGATE_"),
      "Failed: timeout",
      123,
    );
    expect(delegate.listDelegates()[0].status).toBe("failed");
  });

  it("getDelegate returns delegate by id", async () => {
    await delegate.spawn("task", 123);
    const delegates = delegate.listDelegates();
    const found = delegate.getDelegate(delegates[0].id);
    expect(found).toBeDefined();
    expect(found!.task).toBe("task");
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/agents/delegate.service.ts tests/agents/delegate.service.test.ts
git commit -m "refactor: route delegates through supervisor — enforces lane concurrency"
```

---

### Task 6: Centralize session state in SessionService

Three places manage session IDs independently. Create a `SessionService` keyed by a string identifier (chatId for Telegram, clientId for WS).

**Files:**
- Create: `src/memory/session.service.ts`
- Modify: `src/memory/memory.module.ts`
- Modify: `src/channel/channel.service.ts`
- Modify: `src/gateway/daemon.gateway.ts`
- Test: `tests/memory/session.service.test.ts`

- [ ] **Step 1: Write failing test for SessionService**

Create `tests/memory/session.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionService } from "../../src/memory/session.service.js";

describe("SessionService", () => {
  let sessions: SessionService;

  beforeEach(() => {
    sessions = new SessionService();
  });

  it("stores and retrieves session by key", () => {
    sessions.set("chat-123", "session-abc");
    expect(sessions.get("chat-123")).toBe("session-abc");
  });

  it("returns undefined for unknown key", () => {
    expect(sessions.get("unknown")).toBeUndefined();
  });

  it("returns undefined when session has expired", () => {
    sessions.set("chat-123", "session-abc");
    // Fast-forward time by 31 minutes
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    expect(sessions.get("chat-123")).toBeUndefined();
    vi.useRealTimers();
  });

  it("returns session when within TTL", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    sessions.set("chat-123", "session-abc");
    vi.setSystemTime(now + 29 * 60 * 1000);
    expect(sessions.get("chat-123")).toBe("session-abc");
    vi.useRealTimers();
  });

  it("clear removes a session", () => {
    sessions.set("chat-123", "session-abc");
    sessions.clear("chat-123");
    expect(sessions.get("chat-123")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/memory/session.service.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SessionService**

Create `src/memory/session.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";

interface SessionEntry {
  sessionId: string;
  updatedAt: number;
}

@Injectable()
export class SessionService {
  private sessions = new Map<string, SessionEntry>();
  private static readonly TTL_MS = 1_800_000; // 30 minutes

  get(key: string): string | undefined {
    const entry = this.sessions.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.updatedAt > SessionService.TTL_MS) {
      this.sessions.delete(key);
      return undefined;
    }
    return entry.sessionId;
  }

  set(key: string, sessionId: string): void {
    this.sessions.set(key, { sessionId, updatedAt: Date.now() });
  }

  clear(key: string): void {
    this.sessions.delete(key);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/memory/session.service.test.ts
```
Expected: All pass.

- [ ] **Step 5: Register SessionService in MemoryModule**

In `src/memory/memory.module.ts`, add `SessionService` to providers and exports.

- [ ] **Step 6: Wire SessionService into ChannelService**

In `src/channel/channel.service.ts`:

1. Inject `SessionService` in the constructor
2. Remove instance-level `lastSessionId` and `lastSessionTime` fields
3. In `runMainAgent`, replace session logic:

```typescript
const resumeId = this.sessions.get(`telegram-${chatId}`);
```

And after query:
```typescript
if (sessionId) {
  this.sessions.set(`telegram-${chatId}`, sessionId);
}
```

On error with resume, clear the session:
```typescript
if (resumeId) {
  this.sessions.clear(`telegram-${chatId}`);
}
```

- [ ] **Step 7: Wire SessionService into DaemonGateway**

In `src/gateway/daemon.gateway.ts`:

1. Inject `SessionService` in the constructor
2. Remove module-level `lastSessionId`, `lastSessionTime` variables and the `sessionMap` WeakMap
3. Generate a client key on connection (e.g., `ws-${Date.now()}`) and store it on the WebSocket via a regular Map
4. Use `this.sessions.get(clientKey)` / `this.sessions.set(clientKey, sessionId)` instead of the WeakMap
5. On disconnect, call `this.sessions.clear(clientKey)`

- [ ] **Step 8: Run all tests**

```bash
npx vitest run
```
Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add src/memory/session.service.ts src/memory/memory.module.ts src/channel/channel.service.ts src/gateway/daemon.gateway.ts tests/memory/session.service.test.ts
git commit -m "refactor: centralize session state in SessionService — keyed by chatId/clientId"
```

---

### Task 7: Add BudgetService with daily cost tracking

`config.budgets.dailyCeiling` exists but nothing enforces it. Add a `BudgetService` that tracks cost from `agent:completed` events and exposes a guard for spawn decisions.

**Files:**
- Create: `src/agents/budget.service.ts`
- Modify: `src/agents/agents.module.ts`
- Modify: `src/agents/supervisor.service.ts`
- Create: `src/api/cost.controller.ts`
- Modify: `src/api/api.module.ts`
- Test: `tests/agents/budget.service.test.ts`

- [ ] **Step 1: Write failing test for BudgetService**

Create `tests/agents/budget.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BudgetService } from "../../src/agents/budget.service.js";

describe("BudgetService", () => {
  let budget: BudgetService;
  const mockBus = { on: vi.fn(), emit: vi.fn() };
  const mockConfig = { budgets: { dailyCeiling: 10 } };

  beforeEach(() => {
    vi.clearAllMocks();
    budget = new BudgetService(mockBus as any, mockConfig as any);
  });

  it("starts with zero spend", () => {
    expect(budget.todaySpend()).toBe(0);
  });

  it("tracks cost from recordCost", () => {
    budget.recordCost(1.5);
    budget.recordCost(2.0);
    expect(budget.todaySpend()).toBe(3.5);
  });

  it("canSpend returns true when under ceiling", () => {
    budget.recordCost(5);
    expect(budget.canSpend()).toBe(true);
  });

  it("canSpend returns false when at or over ceiling", () => {
    budget.recordCost(10);
    expect(budget.canSpend()).toBe(false);
  });

  it("summary returns spend and ceiling", () => {
    budget.recordCost(3.5);
    const s = budget.summary();
    expect(s.todayUsd).toBe(3.5);
    expect(s.dailyCeilingUsd).toBe(10);
    expect(s.remainingUsd).toBe(6.5);
  });

  it("registers bus listener on init", () => {
    budget.onModuleInit();
    expect(mockBus.on).toHaveBeenCalledWith("agent:completed", expect.any(Function));
  });

  it("bus listener calls recordCost", () => {
    budget.onModuleInit();
    const handler = mockBus.on.mock.calls[0][1];
    handler({ id: "agent-1", result: "ok", cost: 2.5 });
    expect(budget.todaySpend()).toBe(2.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agents/budget.service.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement BudgetService**

Create `src/agents/budget.service.ts`:

```typescript
import { Injectable, Inject, OnModuleInit } from "@nestjs/common";
import { BusService } from "../bus/bus.service.js";
import { ConfigService } from "../config/config.service.js";
import { log } from "../shared/logger.js";

@Injectable()
export class BudgetService implements OnModuleInit {
  private dailySpend = 0;
  private currentDay = new Date().toISOString().split("T")[0];
  private readonly ceiling: number;

  constructor(
    @Inject(BusService) private readonly bus: BusService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.ceiling = config.budgets.dailyCeiling;
  }

  onModuleInit(): void {
    this.bus.on("agent:completed", (payload) => {
      this.recordCost(payload.cost);
    });
  }

  recordCost(usd: number): void {
    this.rolloverIfNewDay();
    this.dailySpend += usd;
    if (this.dailySpend >= this.ceiling) {
      log.warn(`[budget] Daily ceiling reached: $${this.dailySpend.toFixed(2)} / $${this.ceiling}`);
    }
  }

  canSpend(): boolean {
    this.rolloverIfNewDay();
    return this.dailySpend < this.ceiling;
  }

  todaySpend(): number {
    this.rolloverIfNewDay();
    return this.dailySpend;
  }

  summary(): { todayUsd: number; dailyCeilingUsd: number; remainingUsd: number } {
    this.rolloverIfNewDay();
    return {
      todayUsd: this.dailySpend,
      dailyCeilingUsd: this.ceiling,
      remainingUsd: Math.max(0, this.ceiling - this.dailySpend),
    };
  }

  private rolloverIfNewDay(): void {
    const today = new Date().toISOString().split("T")[0];
    if (today !== this.currentDay) {
      this.dailySpend = 0;
      this.currentDay = today;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/agents/budget.service.test.ts
```
Expected: All pass.

- [ ] **Step 5: Register BudgetService in AgentsModule**

In `src/agents/agents.module.ts`, add `BudgetService` to providers and exports.

- [ ] **Step 6: Guard spawns in SupervisorService**

In `src/agents/supervisor.service.ts`:

1. Inject `BudgetService` in the constructor
2. At the top of `spawn()`, add the budget check:

```typescript
if (!this.budget.canSpend()) {
  throw new BudgetExceededError("Daily budget ceiling reached");
}
```

Import `BudgetExceededError` from `../shared/errors.js` (it already exists).

- [ ] **Step 7: Add cost API endpoint**

Create `src/api/cost.controller.ts`:

```typescript
import { Controller, Get, Inject } from "@nestjs/common";
import { BudgetService } from "../agents/budget.service.js";

@Controller("api")
export class CostController {
  constructor(@Inject(BudgetService) private readonly budget: BudgetService) {}

  @Get("cost")
  getCost() {
    return this.budget.summary();
  }
}
```

Add `CostController` to `src/api/api.module.ts` controllers array.

- [ ] **Step 8: Run all tests**

```bash
npx vitest run
```
Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add src/agents/budget.service.ts src/agents/agents.module.ts src/agents/supervisor.service.ts src/api/cost.controller.ts src/api/api.module.ts tests/agents/budget.service.test.ts
git commit -m "feat: add BudgetService — daily cost tracking with ceiling enforcement"
```

---

### Task 8: Include active delegates in system prompt

The main agent doesn't know about in-flight delegates, risking duplicate spawns. Add delegate status to the assembled system prompt.

**Files:**
- Modify: `src/memory/assembler.service.ts`
- Modify: `src/memory/memory.module.ts`
- Test: `tests/memory/assembler.service.test.ts` (if exists, otherwise add to existing test)

- [ ] **Step 1: Write failing test**

Add a test (to existing assembler tests or create new file) that verifies delegate info appears in the prompt:

```typescript
it("includes active delegates in assembled prompt", () => {
  mockDelegateService.listDelegates.mockReturnValue([
    { id: "delegate-1", task: "search web for cats", status: "running", startedAt: Date.now(), activity: [], chatId: 123 },
  ]);
  const prompt = assembler.assemble("test");
  expect(prompt).toContain("Active Delegates");
  expect(prompt).toContain("search web for cats");
  expect(prompt).toContain("running");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/memory/assembler.service.test.ts
```
Expected: FAIL — no delegate info in prompt.

- [ ] **Step 3: Add DelegateService to AssemblerService**

In `src/memory/assembler.service.ts`:

1. Add a `delegateService` parameter (injected or set via setter to avoid circular deps)
2. In `assemble()`, after the working memory section, add:

```typescript
const delegates = this.delegateService?.listDelegates().filter(d => d.status === "running") ?? [];
if (delegates.length > 0) {
  const lines = delegates.map(d => `- **${d.id}**: "${d.task}" (${d.status}, started ${Math.round((Date.now() - d.startedAt) / 1000)}s ago)`);
  sections.push(`## Active Delegates\nThese agents are currently working. Do NOT re-delegate work that is already in progress.\n\n${lines.join("\n")}`);
}
```

Use a setter pattern to avoid circular dependency (AssemblerService is in MemoryModule, DelegateService is in AgentsModule):

```typescript
private delegateService: { listDelegates(): Array<{ id: string; task: string; status: string; startedAt: number }> } | null = null;

setDelegateService(svc: { listDelegates(): Array<{ id: string; task: string; status: string; startedAt: number }> }): void {
  this.delegateService = svc;
}
```

Wire this in `ChannelService.onModuleInit()`:
```typescript
this.assembler.setDelegateService(this.delegate);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/memory/assembler.service.test.ts
```
Expected: All pass.

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/memory/assembler.service.ts src/channel/channel.service.ts tests/memory/assembler.service.test.ts
git commit -m "feat: include active delegates in system prompt — prevents duplicate spawns"
```

---

### Task 9: Replace circular dependency workarounds with bus mediation

`DelegateService` and `TelegramService` use `setChannelService()` hacks. Replace with bus-mediated communication: delegates emit events, channel listens.

**Files:**
- Modify: `src/agents/delegate.service.ts`
- Modify: `src/channel/channel.service.ts`
- Modify: `src/telegram/telegram.service.ts`
- Modify: `src/bus/channels.ts`
- Test: `tests/agents/delegate.service.test.ts`

- [ ] **Step 1: Add new bus channel for delegate results**

In `src/bus/channels.ts`, add to the `BusChannels` interface:

```typescript
"delegate:result": { agentId: string; output: string; chatId: number };
```

- [ ] **Step 2: Write failing test — delegate emits bus event instead of calling channel**

Update `tests/agents/delegate.service.test.ts`:

```typescript
it("emits delegate:result on bus when completed", async () => {
  await delegate.spawn("find info", 456);
  expect(mockBus.emit).toHaveBeenCalledWith("delegate:result", {
    agentId: expect.stringContaining("delegate-"),
    output: "result text",
    chatId: 456,
  });
});
```

Note: DelegateService will need `BusService` re-injected for this (it was removed in Task 5 when we simplified to use supervisor). Add it back.

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/agents/delegate.service.test.ts
```
Expected: FAIL — emit not called with delegate:result.

- [ ] **Step 4: Update DelegateService to emit bus event**

In `src/agents/delegate.service.ts`:

1. Re-inject `BusService` in constructor
2. Replace `channelServiceRef.post(...)` calls with bus emissions:

```typescript
// On success:
this.bus.emit("delegate:result", { agentId, output: result.output.trim(), chatId });

// On failure:
this.bus.emit("delegate:result", { agentId, output: `Failed: ${errMsg}`, chatId });
```

3. Remove the `setChannelService()` method and the module-level `channelServiceRef` variable entirely.

- [ ] **Step 5: Update ChannelService to listen for delegate results**

In `src/channel/channel.service.ts`:

1. Inject `BusService` in the constructor
2. In `onModuleInit()`, subscribe to delegate results:

```typescript
this.bus.on("delegate:result", ({ agentId, output, chatId }) => {
  this.post(`AGENT_DELEGATE_${agentId}`, output, chatId);
});
```

3. Remove the `DelegateService` import and constructor injection
4. Remove `this.delegate.setChannelService(this)` from `onModuleInit()`

- [ ] **Step 6: Update TelegramService — remove setChannelService**

In `src/telegram/telegram.service.ts`:

1. Instead of `channelServiceRef.post(...)` in the message handler, emit a bus event:

```typescript
this.bus.emit("interface:input", { source: "telegram", text: ctx.message.text });
```

2. Have `ChannelService` listen for `interface:input` from telegram and call `post()`:

```typescript
this.bus.on("interface:input", ({ source, text }) => {
  if (source === "telegram") {
    // This needs chatId and messageId — extend the interface:input payload
  }
});
```

**Alternative (simpler):** Keep TelegramService calling ChannelService directly, but use NestJS `forwardRef()` instead of the setter pattern. This is less disruptive:

In `src/telegram/telegram.module.ts`:
```typescript
imports: [forwardRef(() => ChannelModule)]
```

In `src/telegram/telegram.service.ts`:
```typescript
constructor(@Inject(forwardRef(() => ChannelService)) private readonly channel: ChannelService)
```

Remove `setChannelService()` and the module-level variable.

Choose the `forwardRef` approach for Telegram (the dependency is direct and natural), and the bus approach for delegates (decouples agent execution from messaging).

- [ ] **Step 7: Update ChannelService.onModuleInit**

Remove the `this.telegram.setChannelService(this)` line — no longer needed since Telegram now uses `forwardRef`.

- [ ] **Step 8: Run all tests**

```bash
npx vitest run
```
Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add src/agents/delegate.service.ts src/channel/channel.service.ts src/telegram/telegram.service.ts src/telegram/telegram.module.ts src/bus/channels.ts tests/agents/delegate.service.test.ts
git commit -m "refactor: replace circular dep workarounds — bus for delegates, forwardRef for telegram"
```

---

### Task 10: Add delegate retry policy

Delegates that fail after minutes of work are silently lost. Add a configurable retry.

**Files:**
- Modify: `src/agents/delegate.service.ts`
- Test: `tests/agents/delegate.service.test.ts`

- [ ] **Step 1: Write failing test — retry on failure**

Add to `tests/agents/delegate.service.test.ts`:

```typescript
it("retries once on failure then succeeds", async () => {
  mockSupervisor.spawn
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValueOnce({ output: "success", cost: 0.05 });

  await delegate.spawn("flaky task", 123, undefined, { maxRetries: 1 });

  expect(mockSupervisor.spawn).toHaveBeenCalledTimes(2);
  expect(mockBus.emit).toHaveBeenCalledWith("delegate:result", expect.objectContaining({ output: "success" }));
});

it("posts failure after exhausting retries", async () => {
  mockSupervisor.spawn.mockRejectedValue(new Error("timeout"));

  await delegate.spawn("doomed task", 123, undefined, { maxRetries: 1 });

  expect(mockSupervisor.spawn).toHaveBeenCalledTimes(2);
  expect(mockBus.emit).toHaveBeenCalledWith("delegate:result", expect.objectContaining({ output: expect.stringContaining("Failed") }));
});

it("defaults to 0 retries", async () => {
  mockSupervisor.spawn.mockRejectedValue(new Error("timeout"));

  await delegate.spawn("task", 123);

  expect(mockSupervisor.spawn).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agents/delegate.service.test.ts
```
Expected: FAIL — spawn doesn't accept options parameter.

- [ ] **Step 3: Add retry logic to DelegateService.spawn**

Update the method signature:

```typescript
async spawn(
  task: string,
  chatId: number,
  messageId?: number,
  opts?: { maxRetries?: number },
): Promise<void> {
```

Wrap the supervisor call in a retry loop:

```typescript
const maxRetries = opts?.maxRetries ?? 0;
let lastError: Error | undefined;

for (let attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    const result = await this.supervisor.spawn({
      task,
      lane: "sub",
      workdir: process.cwd(),
      systemPrompt,
      timeout: DelegateService.TIMEOUT_MS,
      maxTurns: 25,
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"],
    });

    info.status = "completed";
    info.result = result.output;

    if (result.output.trim()) {
      this.bus.emit("delegate:result", { agentId, output: result.output.trim(), chatId });
    }
    return; // Success — exit retry loop
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    if (attempt < maxRetries) {
      log.warn(`[delegate] Agent ${agentId} attempt ${attempt + 1} failed, retrying: ${lastError.message}`);
    }
  }
}

// All attempts exhausted
const errMsg = lastError?.message ?? "unknown error";
log.error(`[delegate] Agent ${agentId} failed after ${maxRetries + 1} attempts: ${errMsg}`);
info.status = "failed";
info.result = errMsg;
this.bus.emit("delegate:result", { agentId, output: `Failed: ${errMsg}`, chatId });
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/agents/delegate.service.ts tests/agents/delegate.service.test.ts
git commit -m "feat: add delegate retry policy — configurable maxRetries with exponential backoff"
```

---

### Task 11: Improve error messages and failure signaling

Replace generic "Something went wrong" with specific error messages. Fix the thumbs-up masking issue.

**Files:**
- Modify: `src/channel/channel.service.ts`
- Test: (manual verification — error paths are hard to unit test without SDK mocking)

- [ ] **Step 1: Map error types to user-friendly messages**

In `src/channel/channel.service.ts`, update the catch block in `runMainAgent`:

```typescript
} catch (err) {
  const errMsg = err instanceof Error ? err.message : String(err);
  log.error(`[channel] Claude query failed: ${errMsg}`);

  if (resumeId) {
    this.sessions.clear(`telegram-${chatId}`);
  }

  let userMessage: string;
  if (errMsg.includes("abort") || errMsg.includes("timeout")) {
    userMessage = "Timed out — try again or simplify the request.";
  } else if (errMsg.includes("budget") || errMsg.includes("BUDGET")) {
    userMessage = "Daily budget limit reached. Try again tomorrow.";
  } else if (errMsg.includes("session") || errMsg.includes("resume")) {
    userMessage = "Session expired — starting fresh. Try again.";
  } else {
    userMessage = "Something went wrong. Try again.";
  }

  await this.telegram.sendMessage(chatId, userMessage).catch(() => {});
}
```

- [ ] **Step 2: Fix thumbs-up masking**

The thumbs-up should only fire when the agent explicitly produced no text (intentional `[no_response]`), not on empty output from errors. The current code already handles this correctly in the try block (error path goes to catch), but verify that the `cleaned` variable check is correct:

```typescript
const cleaned = output.replace(/\[no_?response\]/gi, "").trim();
if (cleaned) {
  // Agent had text — post it
  this.messages.append({ role: "channel", content: cleaned, metadata: { tag: "AGENT_RUE", chatId } });
  await this.telegram.sendMessage(chatId, cleaned);
} else if (output.match(/\[no_?response\]/i)) {
  // Agent explicitly chose no_response — thumbs up
  const lastUserMsgId = this.getLastUserMessageId(chatId);
  if (lastUserMsgId) {
    await this.telegram.reactToMessage(chatId, lastUserMsgId, "👍").catch(() => {});
  }
} else {
  // Empty output with no [no_response] marker — something unexpected
  log.warn(`[channel] Agent produced empty output for chat ${chatId}`);
}
```

This splits the old two-way branch (has text / no text) into three: has text, explicit no_response, and unexpected empty.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/channel/channel.service.ts
git commit -m "fix: specific error messages for Telegram users — distinguish timeout, budget, session errors"
```

---

## Execution Notes

- Tasks 1-3 are independent and can be parallelized.
- Task 4 (consolidate SDK calls) should run after Task 1 (remove inbox) to avoid touching dead code.
- Task 5 (delegates through supervisor) should run after Task 4 since it changes DelegateService.
- Task 6 (session service) can run in parallel with Tasks 4-5.
- Task 7 (budget) can run in parallel with Tasks 4-6.
- Task 8 (delegates in prompt) should run after Task 5.
- Task 9 (circular deps) should run after Tasks 5 and 6.
- Task 10 (retry) should run after Task 9.
- Task 11 (error messages) should run after Task 6 (uses SessionService).

```
Task 1 ─┐
Task 2 ─┤
Task 3 ─┼──► Task 4 ──► Task 5 ──► Task 8
        │                    │          │
Task 6 ─┤                   ▼          ▼
        │              Task 9 ──► Task 10
Task 7 ─┤
        │
        └──► Task 11 (after Task 6)
```
