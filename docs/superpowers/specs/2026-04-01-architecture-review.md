# Rue Bot Architecture Review

**Date:** 2026-04-01
**Scope:** Full architectural critique, practical pain points, and forward-looking v0.2 scalability analysis.

---

## Strengths

### 1. Dispatcher pattern enforces separation of concerns
The main agent is limited to Bash + 4 turns, forcing it to delegate all real work. This prevents the orchestrator from going on long tool-calling tangents and keeps it focused on routing. The "manager, not worker" principle is enforced structurally, not just by prompt instructions.

### 2. Lane-based concurrency is clean and correct
`LaneQueueService` (~60 lines) implements bounded FIFO concurrency across 4 lanes (main/sub/cron/skill). The drain logic is sound. No over-engineering.

### 3. Event bus is lightweight and well-scoped
Typed channels, wildcard subscriptions, request/reply, and event sourcing to SQLite — all in ~85 lines. Right abstraction for decoupling modules without the overhead of a message broker.

### 4. Channel-based messaging gives agents full context
Single shared thread per chat with tagged participants (`USER_TELEGRAM`, `AGENT_RUE`, `AGENT_DELEGATE_<id>`) means the main agent sees the full conversation including delegate results. The 2-second batching for rapid messages is practical.

### 5. Context assembly is well-layered
`AssemblerService` composes system prompts from 9+ sources (identity, user model, semantic memory, KB, skills, etc.) with a 5-minute cache. Rich situational awareness without bloating any single file.

### 6. Small, readable codebase
Most services are 60-130 lines. NestJS module structure creates clear boundaries. Any single service fits in your head.

---

## Architectural Issues

### A1. Three copies of `runClaudeQuery`
`ChannelService`, `InboxProcessorService`, and `DaemonGateway` each contain ~70-line implementations of the same SDK query loop (import SDK, create AbortController, iterate messages, handle stream_event/assistant/result). `ClaudeProcessService` exists and does exactly this, but only `SupervisorService` and `DelegateService` use it. Bug fixes to streaming logic need to happen in 3+ places. Session management, timeout handling, and output extraction differ subtly across copies.

**Fix:** Route all SDK calls through `ClaudeProcessService`. The gateway can still stream tokens by registering an `onOutput` callback.

### A2. `ChannelService` and `InboxProcessorService` overlap ~90%
Both do: batch telegram messages by chatId (2s window) -> sequential per-chat processing -> assemble system prompt -> run Claude query (Bash-only, 4 turns) -> send response to Telegram -> handle `[no_response]`. The inbox processor is the pre-channel version that was never removed. They may conflict if both are wired into the module graph.

**Fix:** Remove `InboxProcessorService` and `InboxService`. Fully commit to the channel-based architecture.

### A3. Circular dependency workaround is a code smell
`DelegateService` uses a module-level `let channelServiceRef` variable, and `TelegramService` uses a similar `setChannelService()` pattern. This works but indicates a dependency cycle: Channel -> Telegram -> Channel and Channel -> Delegate -> Channel.

**Fix:** Use the bus as mediator. Delegate emits `agent:completed`, channel listens — no direct import needed. Alternatively, use NestJS `forwardRef()`.

### A4. `SupervisorService` and `DelegateService` are parallel hierarchies
Both manage agent lifecycle (spawn, track, kill, emit bus events, health monitoring). The supervisor routes through `LaneQueueService`; the delegate runs directly with its own timeout logic. Delegates bypass concurrency control entirely — if 10 spawn simultaneously, they all run, ignoring the `sub: 6` lane limit.

**Fix:** Delegates should spawn through the supervisor (which uses the lane queue), or at minimum enqueue themselves in the `sub` lane.

### A5. Session state is scattered and conflicting
Three independent session stores:
- `DaemonGateway`: module-level `lastSessionId` + `lastSessionTime` + per-WS WeakMap
- `ChannelService`: instance-level `lastSessionId` + `lastSessionTime`
- `InboxProcessorService`: instance-level `lastSessionId` + `lastSessionTime`

These can't coordinate. Module-level variables in the gateway survive across WS clients (probably unintended).

**Fix:** Centralize session state in a `SessionService` keyed by chatId/clientId.

### A6. Planner is wired but not connected
`PlannerService` and `TaskDAG` exist and are correct, but nothing in the actual message flow calls them. Both the Telegram and WS paths go straight from query to delegate. The planner is dead code.

**Fix:** Either integrate the planner into the delegation flow (main agent can request a plan before spawning delegates) or remove it until v0.2.

### A7. No cost tracking or budget enforcement
`config.budgets.dailyCeiling = 10` exists in the config schema but nothing reads or enforces it. Individual agents can have `maxBudgetUsd`, but there's no system-level aggregation.

**Fix:** Add a `BudgetService` that tracks cumulative daily cost from `agent:completed` events and rejects spawns when the ceiling is hit.

---

## Practical Pain Points

### P1. Delegate failures are fire-and-forget
If a delegate fails (timeout, SDK error, bad output), it posts `"Failed: {error}"` to the channel. No automatic retry, no escalation. A 10-minute delegate that fails at minute 9 is a silent loss.

**Fix:** Add retry policy (configurable per-delegate, default 1 retry). Emit `agent:failed` with `retryable: true` when appropriate. Consider escalation to user after final failure.

### P2. Main agent has no awareness of in-flight delegates
Each `triggerAgent` call gets the last 20 messages as context but has no tracking of currently-running delegates. Follow-up messages before delegate completion can cause duplicate spawns.

**Fix:** Include active delegate status in the assembled system prompt (from `DelegateService.listDelegates()`). The main agent can then decide whether to wait or spawn new work.

### P3. `getHistory` is inefficient
Calls `messages.recent(limit * 2)` then filters by chatId in JS. Grows linearly with message volume across all chats. The double chatId comparison (`m.metadata?.chatId === chatId || (m.metadata as any)?.chatId === chatId`) suggests a typing issue patched around.

**Fix:** Add a `recentByChatId(chatId, limit)` method to `MessageRepository` that filters at the SQL level.

### P4. Delegate output is silently truncated
`info.result = result.output.slice(0, 1000)` — the stored result is capped at 1000 chars, but the full output goes to the channel. The API endpoint returns incomplete data.

**Fix:** Store full output (or a reasonable limit like 10K). If truncation is needed, make it explicit in the API response.

### P5. Error messages are generic
Every failure path sends `"Something went wrong. Try again."` to Telegram. No indication of timeout, budget, SDK crash, or session failure.

**Fix:** Map error types to user-friendly messages: "Timed out after 60s", "Budget limit reached", "Session expired, starting fresh", etc.

### P6. No cost observability
Bus events include cost, persisted to events table, but there's no aggregation endpoint or daily summary. Requires manual SQLite queries to see spend.

**Fix:** Add `GET /api/cost` endpoint with daily/weekly aggregation. Consider a daily Telegram summary via cron.

### P7. The thumbs-up fallback masks failures
When the agent outputs empty or `[no_response]`, a thumbs-up reaction is sent. This can hide genuine failures or misunderstandings — the user sees acknowledgment when nothing was delegated.

**Fix:** Only react with thumbs-up when the agent explicitly chose `no_response` (not when output is empty due to error). On empty output from an error path, send a brief status message instead.

---

## Forward-Looking (v0.2 Scalability)

### F1. Single-session-per-chat won't survive multi-user
`ChannelService` has one `lastSessionId` for the entire instance. Adding a second user or chat causes session collisions. The gateway has the same problem with module-level session variables.

**Fix:** Key session state by chatId. A `SessionService` with a `Map<chatId, SessionInfo>` resolves this.

### F2. Skills have no runtime
Current skill system is "read SKILL.md, then shell out." No registry, no lifecycle hooks, no capability negotiation, no typed I/O. For v0.2 where skills are first-class, this needs: discovery, validation, typed invocation, result capture, error handling.

**Fix:** Build a `SkillRuntime` that wraps skill execution with structured input/output, timeout, and error handling. Skills register capabilities on startup.

### F3. Planner can't actually plan
`PlannerService.createDAG()` takes explicit `TaskDefinition[]` with hardcoded dependencies. There's no AI-driven decomposition — no step where Claude breaks a goal into subtasks.

**Fix:** Add a `decompose(goal) -> TaskDefinition[]` step that calls Claude with a structured output schema. The existing DAG executor can then run the result.

### F4. Memory systems are disconnected
Five independent stores (semantic, KB, daily notes, episodic, working) with no cross-referencing. The assembler concatenates them all. No embedding search, no relevance scoring beyond naive keyword matching. As knowledge grows, the prompt will bloat or important context will be dropped.

**Fix:** Unified retrieval layer with embedding-based search. Short term: improve keyword scoring and add a token budget to the assembler so it prioritizes the most relevant context.

### F5. No agent-to-agent communication
Delegates can't talk to each other. If delegate A discovers something B needs, the only path is through the channel (A posts, main agent re-triggers, maybe passes it along). For parallel DAG execution, agents on related subtasks need to share intermediate results.

**Fix:** Agents can emit/listen on bus channels (infrastructure exists). Add a `shared-context` channel type that DAG-sibling agents subscribe to.

### F6. Identity evolution is aspirational
`IdentityService` and `UserModelService` have update methods but nothing calls them. No automated feedback loop observes patterns and updates the model.

**Fix:** Add a reflection cron job that reviews recent conversations (e.g., daily) and proposes identity/user-model updates. Could be a delegate with specific instructions.

### F7. Inbox/channel split creates migration ambiguity
Both exist, both are wired. New features face an unclear integration target.

**Fix:** Remove the inbox system entirely. Commit to channels as the single messaging architecture.

---

## Priority Ranking

Ordered by impact and effort, recommended for a cleanup pass before v0.2 work:

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 | A2+F7: Remove inbox, commit to channels | Low | Eliminates confusion, removes dead code |
| 2 | A1: Consolidate `runClaudeQuery` into `ClaudeProcessService` | Medium | Fixes 3-way duplication, single place for SDK bugs |
| 3 | A4: Route delegates through supervisor/lane queue | Medium | Fixes concurrency bypass, unifies lifecycle |
| 4 | A5+F1: Centralize session state by chatId | Medium | Fixes multi-chat bugs, unblocks multi-user |
| 5 | A7+P6: Add budget tracking and enforcement | Low | Prevents runaway spend |
| 6 | P2: Include active delegates in system prompt | Low | Prevents duplicate spawns |
| 7 | P3: SQL-level chat filtering in MessageRepository | Low | Performance fix |
| 8 | A3: Replace circular dep workaround with bus mediation | Medium | Cleaner architecture |
| 9 | P1: Add delegate retry policy | Medium | Resilience |
| 10 | P5+P7: Improve error messages and failure signaling | Low | Better UX |
