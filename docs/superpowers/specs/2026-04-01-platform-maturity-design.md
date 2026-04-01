# Platform Maturity: Channel Adapters, Routing, Session Maintenance, Model Failover, Advanced Debouncing

**Date:** 2026-04-01
**Goal:** Adopt the best production patterns from OpenClaw while preserving Rue's architectural strengths — making Rue a superior personal AI assistant platform.

---

## 1. Channel Adapter Abstraction

### Interface

```typescript
type ChannelCapability = "reactions" | "threading" | "media" | "editing" | "polls";

interface ChannelAdapter {
  readonly id: string;                          // "telegram", "discord", "slack"
  readonly capabilities: Set<ChannelCapability>;
  
  start(): Promise<void>;
  stop(): Promise<void>;
  
  sendMessage(target: ChannelTarget, text: string, opts?: SendOptions): Promise<SentMessage>;
  sendReaction(target: ChannelTarget, messageId: string, emoji: string): Promise<void>;
  
  onMessage: (handler: (msg: InboundMessage) => void) => () => void;
}

interface ChannelTarget {
  chatId: string;
  replyToMessageId?: string;
}

interface SendOptions {
  replyToMessageId?: string;
  parseMode?: "text" | "html" | "markdown";
}

interface SentMessage {
  messageId: string;
  chatId: string;
  channelId: string;
}

interface InboundMessage {
  channelId: string;
  chatId: string;
  senderId: string;
  messageId: string;
  text: string;
  media?: MediaAttachment[];
  replyTo?: string;
  timestamp: number;
}

interface MediaAttachment {
  type: "photo" | "video" | "audio" | "document" | "voice" | "sticker";
  url?: string;
  fileId?: string;
  mimeType?: string;
  caption?: string;
}
```

### ChannelRegistry

Holds all registered adapters. Provides:
- `register(adapter)` — register an adapter by id
- `get(id)` — retrieve adapter
- `sendMessage(channelId, target, text, opts?)` — route outbound through correct adapter
- `sendReaction(channelId, target, messageId, emoji)` — route reaction through correct adapter
- `startAll()` / `stopAll()` — lifecycle management

All inbound messages from all adapters funnel through a single `onMessage` handler that feeds into the debounce layer.

### TelegramAdapter

Extracted from current `TelegramService`. Implements `ChannelAdapter`. Retains:
- Telegraf bot lifecycle (start/stop)
- Message chunking (4096 char limit, paragraph-aware splitting)
- Pairing flow (via `TelegramStoreService`, moved to `src/channels/adapters/`)
- Reaction support
- Media handling

### File Structure

```
src/channels/
├── channel-adapter.ts          # Interface + types
├── channel-registry.ts         # Adapter lifecycle + dispatch
├── channels.module.ts          # NestJS module
└── adapters/
    ├── telegram.adapter.ts     # Extracted from TelegramService
    └── telegram-store.service.ts  # Pairing (moved from src/telegram/)
```

**Deleted:**
- `src/telegram/telegram.service.ts`
- `src/telegram/telegram.module.ts`

---

## 2. Declarative Routing

### Config Schema

```typescript
// In ~/.rue/config.json
{
  "routes": [
    { "match": { "channel": "telegram", "chatId": "123456" }, "agent": "code-assistant" },
    { "match": { "channel": "telegram", "chatType": "group" }, "agent": "group-helper" },
    { "match": { "channel": "discord" }, "agent": "default" },
    { "match": {}, "agent": "default" }
  ],
  "agents": {
    "default": {
      "systemPrompt": "prompts/SYSTEM.md",
      "personality": "prompts/PERSONALITY.md",
      "tools": ["Bash"]
    },
    "code-assistant": {
      "systemPrompt": "prompts/CODE.md",
      "tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
    }
  }
}
```

### Matching Priority

Routes are evaluated in order, first match wins:
1. Exact `channel` + `chatId`
2. `channel` + `chatType` (direct/group)
3. `channel` only
4. Catch-all `{}`

### RouterService

- `resolve(msg: InboundMessage): ResolvedRoute` — match message against rules, return agent config
- If no routes configured, returns default route (current behavior: SYSTEM.md + PERSONALITY.md, Bash-only tools)

### ResolvedRoute

```typescript
interface ResolvedRoute {
  agentId: string;
  systemPromptPath: string;
  personalityPath?: string;
  tools: string[];
}
```

### Integration

`ChannelService` receives a `ResolvedRoute` along with each debounced batch. `AssemblerService.assemble()` accepts the resolved route's prompt paths instead of hardcoding `prompts/SYSTEM.md` and `prompts/PERSONALITY.md`.

### Backward Compatibility

If no `routes` or `agents` config exists, a single implicit default route matches everything with the current behavior.

### File Structure

```
src/routing/
├── router.service.ts       # Route matching logic
└── routing.module.ts        # NestJS module
```

---

## 3. Session Maintenance

### Config Schema

```typescript
// In ~/.rue/config.json
{
  "sessions": {
    "messageTtlDays": 30,
    "maxMessagesPerChat": 500,
    "vacuumAfterCleanup": true
  }
}
```

### SessionMaintenanceService

Runs on daemon startup + every 24 hours. Also exposed via `GET /api/maintenance/run`.

**Operations (in order):**
1. **TTL pruning** — `DELETE FROM messages WHERE created_at < ?` (now - ttlDays)
2. **Per-chat capping** — for each distinct chatId, delete all but the most recent `maxMessagesPerChat` messages (using `json_extract(metadata, '$.chatId')`)
3. **Event log pruning** — same TTL applied to the `events` table
4. **SQLite VACUUM** — if `vacuumAfterCleanup` is true, reclaim disk space

**Emits:** `system:maintenance` bus event with `{ deletedMessages: number, deletedEvents: number }`.

**Logging:** Logs operation summary at info level.

### File Structure

- `src/database/session-maintenance.service.ts` (registered in DatabaseModule)

---

## 4. Model Failover

### Config Schema

```typescript
// In ~/.rue/config.json
{
  "models": {
    "primary": "opus",
    "fallback": ["sonnet"]
  }
}
```

### Failover Logic

In `ClaudeProcess.run()`, wrap the SDK `query()` call:

1. Build model list: `[primary, ...fallback]`
2. For each model in order:
   - Attempt `query()` with that model
   - On success: return result (include which model was used in `SpawnResult`)
   - On retryable error (rate limit, overloaded, timeout, billing): log warning, try next model
   - On non-retryable error: throw immediately
3. If all models exhausted: throw the last error

### Retryable Error Detection

Match error messages against patterns:
- `rate_limit`, `429`
- `overloaded`, `529`
- `timeout`, `abort`
- `billing`, `insufficient`

### Bus Channel

```typescript
"agent:failover": { id: string; fromModel: string; toModel: string; reason: string }
```

### SpawnResult Extension

Add `model: string` to `SpawnResult` so callers know which model actually ran.

### Changes

- `src/agents/claude-process.service.ts` — failover loop
- `src/agents/types.ts` — `model?: string` in `AgentConfig`, `model: string` in `SpawnResult`
- `src/config/config.service.ts` — `models` schema
- `src/bus/channels.ts` — new channel type

### Backward Compatibility

Default: `{ primary: "opus", fallback: [] }` — identical to current behavior.

---

## 5. Advanced Debouncing

### Config Schema

```typescript
// In ~/.rue/config.json
{
  "debounce": {
    "textGapMs": 2000,
    "mediaGapMs": 100,
    "maxFragments": 12,
    "maxChars": 10000
  }
}
```

### DebounceService

Receives raw `InboundMessage` from the `ChannelRegistry`. Outputs `DebouncedBatch` to the channel service.

```typescript
interface DebouncedBatch {
  chatId: string;
  channelId: string;
  messages: InboundMessage[];
  combinedText: string;
  media: MediaAttachment[];
}
```

**Logic per chatId:**
1. On first message: start timer (`textGapMs` for text, `mediaGapMs` for media-only)
2. On subsequent messages within gap: reset timer, append to batch
3. On timer expiry: emit batch, clear state
4. **Fragment cap:** If batch hits `maxFragments` or `maxChars`, emit immediately without waiting for timer
5. **Media grouping:** Messages with media and no text use the shorter `mediaGapMs` window

### Integration

`ChannelService` removes its inline batching logic (`batchTimers`, `batchedMessages` Maps) and subscribes to `DebouncedBatch` from `DebounceService`.

### File Structure

- `src/channels/debounce.service.ts` (registered in ChannelsModule)

### Backward Compatibility

Default config matches current behavior (2s text gap).

---

## Data Flow (End to End)

```
Platform (Telegram, Discord, ...)
    ↓
ChannelAdapter.onMessage() → InboundMessage
    ↓
ChannelRegistry → dispatches to DebounceService
    ↓
DebounceService → batches → DebouncedBatch
    ↓
RouterService.resolve() → ResolvedRoute (agent config)
    ↓
ChannelService.triggerAgent(batch, route)
    ↓
AssemblerService.assemble(route) → system prompt
    ↓
ClaudeProcessService.createProcess(config with model failover)
    ↓
Response → ChannelRegistry.sendMessage(channelId, target, text)
    ↓
ChannelAdapter.sendMessage() → Platform
```

---

## Config Summary

All new config fields with defaults:

```json
{
  "port": 18800,
  "dataDir": "~/.rue",
  "lanes": { "main": 1, "sub": 6, "cron": 2, "skill": 2 },
  "maxAgents": 8,
  "stall": { "timeoutMs": 60000, "nudgeMs": 30000 },
  "budgets": { "dailyCeiling": 10 },
  "models": {
    "primary": "opus",
    "fallback": ["sonnet"]
  },
  "sessions": {
    "messageTtlDays": 30,
    "maxMessagesPerChat": 500,
    "vacuumAfterCleanup": true
  },
  "debounce": {
    "textGapMs": 2000,
    "mediaGapMs": 100,
    "maxFragments": 12,
    "maxChars": 10000
  },
  "routes": [],
  "agents": {
    "default": {
      "systemPrompt": "prompts/SYSTEM.md",
      "personality": "prompts/PERSONALITY.md",
      "tools": ["Bash"]
    }
  }
}
```

---

## New File Summary

```
src/channels/
├── channel-adapter.ts              # Interface + types
├── channel-registry.ts             # Adapter lifecycle + dispatch
├── debounce.service.ts             # Advanced debouncing
├── channels.module.ts              # NestJS module
└── adapters/
    ├── telegram.adapter.ts         # Telegram implementation
    └── telegram-store.service.ts   # Telegram pairing (moved)

src/routing/
├── router.service.ts               # Route matching
└── routing.module.ts               # NestJS module

src/database/
└── session-maintenance.service.ts  # TTL pruning, capping, vacuum
```

**Moved:**
- `src/channel/channel.service.ts` → `src/channels/channel.service.ts` (adapter-agnostic, uses debounce + router)
- `src/channel/channel.module.ts` → merged into `src/channels/channels.module.ts`

**Deleted:**
- `src/telegram/telegram.service.ts` (replaced by `src/channels/adapters/telegram.adapter.ts`)
- `src/telegram/telegram.module.ts` (merged into `src/channels/channels.module.ts`)
- `src/channel/` directory (merged into `src/channels/`)

**Modified:**
- `src/agents/claude-process.service.ts` — model failover
- `src/agents/types.ts` — model fields
- `src/config/config.service.ts` — new config sections
- `src/bus/channels.ts` — new event types
- `src/memory/assembler.service.ts` — accepts route config for prompt paths
- `src/app.module.ts` — new modules, remove old telegram/channel modules
