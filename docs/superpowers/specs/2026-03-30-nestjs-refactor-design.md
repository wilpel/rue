# Rue Bot — NestJS Refactor Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Scope:** Full architectural refactor from raw Node.js to NestJS

## Goals

- Replace monolithic `DaemonServer` (1,059 lines) with clean NestJS modules
- Proper dependency injection, separation of concerns, testability
- Centralize scattered SQLite databases into single Drizzle-managed DB
- Split WebSocket real-time streaming from REST request/response
- Production-grade patterns: controllers, services, repositories, modules
- Phased migration — each step independently deployable

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Naming | Clear names (MemoryModule, not LimbicModule) | Readability over cleverness |
| Database | Single SQLite + Drizzle ORM | Fits always-on daemon, no infra dependency |
| Transport | WS gateway + REST controllers | WS for streaming, REST for CRUD |
| Skills | Keep as external CLIs | Clean agent↔skill boundary, decoupled |
| Test runner | Vitest (kept) | Already in use, works well |

## Module Structure

```
src/
├── main.ts                          # Bootstrap NestJS app
├── app.module.ts                    # Root module
│
├── config/                          # ConfigModule (global)
│   ├── config.module.ts
│   └── config.service.ts            # Loads ~/.rue/config.json, validates with Zod
│
├── database/                        # DatabaseModule (global)
│   ├── database.module.ts
│   └── database.service.ts          # Drizzle connection to ~/.rue/data/rue.sqlite
│
├── bus/                             # BusModule (global)
│   ├── bus.module.ts
│   ├── bus.service.ts               # Typed pub/sub + request/reply
│   └── bus-persistence.service.ts   # Writes events to DB events table
│
├── agents/                          # AgentsModule
│   ├── agents.module.ts
│   ├── claude-process.service.ts    # Wraps @anthropic-ai/claude-agent-sdk query()
│   ├── supervisor.service.ts        # Spawn/kill/list/steer agents
│   ├── lane-queue.service.ts        # Per-lane concurrency control
│   ├── health.service.ts            # Stall detection via interval polling
│   └── delegate.service.ts          # Background task spawn + tracking + Telegram delivery
│
├── memory/                          # MemoryModule
│   ├── memory.module.ts
│   ├── semantic.repository.ts       # facts table CRUD (Drizzle)
│   ├── working-memory.service.ts    # In-memory Map, snapshot/restore
│   ├── assembler.service.ts         # Builds full system prompt from all sources
│   ├── knowledge-base.service.ts    # ~/.rue/kb/ markdown vault operations
│   └── message.repository.ts        # messages table CRUD (Drizzle)
│
├── identity/                        # IdentityModule
│   ├── identity.module.ts
│   ├── identity.service.ts          # Agent personality — persistent JSON file
│   └── user-model.service.ts        # User profile — persistent JSON file
│
├── planner/                         # PlannerModule
│   ├── planner.module.ts
│   ├── dag.service.ts               # TaskDAG: dependency graph
│   └── planner.service.ts           # Execute DAGs via supervisor
│
├── scheduler/                       # SchedulerModule
│   ├── scheduler.module.ts
│   └── scheduler.service.ts         # Poll jobs table, fire due jobs via agents
│
├── gateway/                         # GatewayModule — WebSocket real-time
│   ├── gateway.module.ts
│   ├── daemon.gateway.ts            # @WebSocketGateway, handles ask/stream/subscribe
│   └── protocol.ts                  # Zod frame schemas (ClientFrame, DaemonFrame)
│
├── api/                             # ApiModule — REST controllers
│   ├── api.module.ts
│   ├── status.controller.ts         # GET /api/status, GET /api/dashboard
│   ├── projects.controller.ts       # GET/POST /api/projects, tasks, docs
│   ├── delegates.controller.ts      # GET /api/delegates, POST /api/delegate
│   ├── secrets.controller.ts        # GET/POST/DELETE /api/secrets
│   └── history.controller.ts        # GET /api/history
│
├── telegram/                        # TelegramModule
│   ├── telegram.module.ts
│   ├── telegram.service.ts          # Telegraf bot, message handling, streaming flush
│   └── telegram-store.service.ts    # Pairing codes, user management
│
├── cli/                             # CLI (stays as Commander.js, outside NestJS DI)
│   ├── commands.ts                  # rue chat | ask | daemon start/stop | telegram
│   ├── client.ts                    # DaemonClient — WS consumer
│   └── tui/                         # React/Ink terminal UI (unchanged)
│
└── shared/                          # Shared utilities (no module, just imports)
    ├── types.ts                     # Lane, AgentState, TaskStatus
    ├── ids.ts                       # nanoid generators
    ├── logger.ts                    # Pino setup
    ├── errors.ts                    # Custom error classes
    └── sdk-types.ts                 # Claude SDK type helpers
```

## Dependency Graph

```
AppModule
├── ConfigModule          (global)
├── DatabaseModule        (global)
├── BusModule             (global)
│
├── IdentityModule        (imports: ConfigModule)
├── MemoryModule          (imports: DatabaseModule, IdentityModule, ConfigModule)
├── AgentsModule          (imports: BusModule, MemoryModule, ConfigModule)
├── PlannerModule         (imports: BusModule, AgentsModule)
├── SchedulerModule       (imports: BusModule, DatabaseModule, AgentsModule)
├── TelegramModule        (imports: BusModule, AgentsModule, ConfigModule)
│
├── GatewayModule         (imports: BusModule, AgentsModule, MemoryModule, PlannerModule, IdentityModule)
└── ApiModule             (imports: AgentsModule, MemoryModule, SchedulerModule, ConfigModule)
```

## Database Schema

Single SQLite at `~/.rue/data/rue.sqlite`, managed by Drizzle:

```typescript
// messages — conversation history
messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),           // user | assistant | push | agent-event
  content: text("content").notNull(),
  metadata: text("metadata"),             // JSON
  createdAt: integer("created_at").notNull(),
});

// facts — semantic knowledge store
facts = sqliteTable("facts", {
  key: text("key").primaryKey(),
  content: text("content").notNull(),
  tags: text("tags"),                     // JSON array
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// jobs — scheduled tasks
jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  schedule: text("schedule").notNull(),
  task: text("task").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  lastRunAt: integer("last_run_at"),
  nextRunAt: integer("next_run_at"),
});

// events — bus event persistence
events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channel: text("channel").notNull(),
  payload: text("payload").notNull(),     // JSON
  createdAt: integer("created_at").notNull(),
});

// telegram_users — paired Telegram users
telegramUsers = sqliteTable("telegram_users", {
  telegramId: integer("telegram_id").primaryKey(),
  username: text("username"),
  pairedAt: text("paired_at").notNull(),
});
```

**Stays as files (not in SQLite):**
- Identity: `~/.rue/identity/identity.json`
- User model: `~/.rue/identity/user-profile.json`
- Knowledge base: `~/.rue/kb/**/*.md`
- Config: `~/.rue/config.json`
- Working memory snapshot: `~/.rue/data/working-memory.json`

## Key Data Flows

### Telegram Message → Response

```
Telegraf (incoming message)
  → TelegramService.handleMessage(ctx)
    → AssemblerService.assemble(task)         // builds system prompt
    → ClaudeProcessService.query(prompt, opts) // SDK call with AbortController
      → streams text_delta chunks
        → TelegramService flushes to Telegram (8s burst detection)
    → if delegation needed:
        → DelegateService.spawn(task, chatId)
          → background ClaudeProcess runs
          → on completion: TelegramService.sendDirectMessage(chatId, result)
    → MessageRepository.append(role, content)
```

### WebSocket Ask → Stream

```
DaemonGateway @SubscribeMessage('cmd')
  → validate frame (Zod)
  → AssemblerService.assemble(task)
  → ClaudeProcessService.query(prompt, opts)
    → streams chunks via client.emit('stream', data)
  → on completion: MessageRepository.append()
  → client.emit('result', { output, cost })
```

### REST Status

```
StatusController.getStatus()
  → SupervisorService.listAgents()
  → return JSON
```

### Delegate Spawn

```
DelegatesController.spawn(dto)
  → DelegateService.spawn(task, chatId, messageId)
    → tracks in Map with activity log
    → ClaudeProcessService.query() in background
      → records tool_use blocks to activity[]
    → on completion: TelegramService.sendDirectMessage()
    → updates tracking: status=completed, result
    → auto-cleanup after 10 minutes
```

## Testing Strategy

**Unit tests:** Every service tested in isolation via `Test.createTestingModule()` with mock providers. Vitest stays as test runner.

**Integration tests:** Module-level tests with real SQLite (temp file), testing service → repository → DB flow.

**E2E test:** Boot full NestJS app, connect via WS, send ask, verify streaming + persistence.

**Skills:** Tested separately as CLI invocations (unchanged).

## Migration Phases

Each phase results in a working, deployable daemon:

1. **Scaffold** — NestJS bootstrap, ConfigModule, DatabaseModule with Drizzle schema + migration from old DB files
2. **Core services** — BusModule, MemoryModule, IdentityModule (no HTTP yet, just services)
3. **Agent services** — AgentsModule with ClaudeProcess, Supervisor, LaneQueue, Health, Delegate
4. **Gateway + API** — WS gateway for streaming, REST controllers for CRUD
5. **Telegram** — TelegramModule with bot lifecycle and streaming flush
6. **Scheduler + Planner** — SchedulerModule, PlannerModule
7. **CLI adapter** — Point Commander.js at new gateway/API
8. **Tests** — Migrate existing 26 test files to NestJS testing patterns
9. **Cleanup** — Remove old src/daemon/, src/cortex/, src/bus/ etc.

## What Does NOT Change

- `skills/` directory — stays as external CLI scripts
- `prompts/` — SYSTEM.md and PERSONALITY.md stay as files
- `cli/tui/` — React/Ink TUI stays as-is
- `cli/client.ts` — DaemonClient WS consumer stays
- `~/.rue/kb/` — Knowledge base vault stays as markdown files
- Vitest as test runner
