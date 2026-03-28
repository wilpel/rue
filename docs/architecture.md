# Architecture

Rue Bot is an always-on TypeScript daemon that wraps the Claude Agent SDK. It runs as a long-lived process, accepts input from multiple interfaces (CLI, web, future channels), and delegates work to Claude-powered agents managed through a layered cognitive architecture.

## High-level overview

```
┌──────────────────────────────────────────────────────┐
│                    Interfaces                        │
│  CLI (Commander.js)  │  Web (React SPA)  │  Channels │
└──────────┬───────────┴─────────┬─────────┴───────────┘
           │  WebSocket / HTTP   │
┌──────────▼─────────────────────▼─────────────────────┐
│                 Daemon Server                         │
│  server.ts (HTTP + WS)  │  handler.ts (commands)     │
│  protocol.ts (frames)   │  task watcher (polling)    │
└──────────┬───────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────┐
│                    Event Bus                          │
│  Typed pub/sub  │  Request/reply  │  Wildcard subs   │
│  Persistence (JSONL)  │  Middleware pipeline          │
└──┬──────────┬──────────┬──────────┬──────────────────┘
   │          │          │          │
┌──▼──┐  ┌───▼───┐  ┌───▼────┐  ┌─▼──────────┐
│Cortex│  │Agents │  │Messages│  │  Skills     │
│      │  │       │  │ Store  │  │(filesystem) │
└──────┘  └───────┘  └────────┘  └─────────────┘
```

Everything communicates through the event bus. No subsystem imports another directly — they emit events and subscribe to channels.

## Cortex layers

The cortex is modeled loosely after brain regions. Each layer handles a different cognitive concern and operates independently.

### Prefrontal — planning and task decomposition

Location: `src/cortex/prefrontal/`

The prefrontal layer breaks complex goals into executable steps.

**Planner** (`planner.ts`) takes a task description and produces a directed acyclic graph (DAG) of subtasks. Each node in the DAG represents a unit of work that can be assigned to an agent.

**TaskDAG** (`dag.ts`) manages the dependency graph:
- Nodes track status: `pending → running → completed | failed`
- `getReadyNodes()` returns nodes whose dependencies are all satisfied
- Supports parallel execution — multiple ready nodes run concurrently
- `topologicalOrder()` for sequential fallback

When a node completes, the planner checks for newly-ready nodes and spawns agents for them through the supervisor. Events emitted: `task:created`, `task:updated`, `task:completed`.

### Limbic — memory, identity, and context

Location: `src/cortex/limbic/`

The limbic layer manages everything the agent "knows" and "is." It has three subsystems.

#### Memory

Three memory types serve different purposes:

**Semantic memory** (`memory/semantic.ts`) — long-term factual knowledge stored in SQLite (`~/.rue/memory/semantic/knowledge.sqlite`). Key-value pairs with tags. Keyword search (vector embeddings planned for later). Persists across restarts.

**Working memory** (`memory/working.ts`) — current session state held in-memory. Key-value store with snapshot/restore for crash recovery. Cleared between sessions unless explicitly persisted.

**Context assembler** (`memory/assembler.ts`) — builds the system prompt for each agent turn. It combines:
1. Base system prompt (`prompts/SYSTEM.md`)
2. Personality (`prompts/PERSONALITY.md`)
3. Identity state (name, values, communication style)
4. User model (expertise, preferences, work patterns)
5. Relevant semantic memories (searched by task context)
6. Working memory snapshot
7. Discovered skills (from `skills/` directory)
8. Running agent list

This assembled prompt gives each agent call full situational awareness.

#### Identity

**IdentityCore** (`identity/core.ts`) — persistent identity stored at `~/.rue/identity/identity.json`. Starts with defaults (unnamed, helpful, clear). Evolves through interaction. Fields: name, personalityBase, communicationStyle, values, expertiseAreas, quirks.

**UserModel** (`identity/user-model.ts`) — learned profile of the user at `~/.rue/identity/user-profile.json`. Tracks expertise levels, preferences, work patterns, current projects, and communication style. Updated as the agent learns from interactions.

### Cerebellum — automation and scheduling (v0.2+)

Location: `src/cortex/cerebellum/`

Currently a stub. Will contain:
- **Skill engine** — runtime for filesystem-based skills
- **Pulse system** — cron-like scheduling for recurring tasks

## Daemon lifecycle

### Startup

`DaemonServer.start()` initializes subsystems in order:

1. **Event bus** — typed pub/sub created first; everything else depends on it
2. **Lane queue** — concurrency lanes initialized (main: 1, sub: 6, cron: 2, skill: 2)
3. **Supervisor** — agent lifecycle manager connected to lanes and bus
4. **Persistence** — event log at `~/.rue/events/events.jsonl` (append-only JSONL)
5. **Memory systems** — semantic memory (SQLite), working memory (in-memory)
6. **Identity** — loads or creates identity and user model from `~/.rue/identity/`
7. **Context assembler** — wired to memory + identity for prompt building
8. **Planner** — task DAG engine connected to supervisor
9. **HTTP + WebSocket server** — starts listening on configured port (default 18800)
10. **Task watcher** — begins polling projects every 10 seconds
11. Emits `system:started` on the bus

### Shutdown

`DaemonServer.stop()` tears down in reverse:

1. Emits `system:shutdown` with reason
2. Stops task watcher (clears polling interval)
3. Kills all running agents via supervisor (`shutdown()`)
4. Closes memory stores and identity persistence
5. Closes WebSocket server and HTTP listener

### Crash recovery

- **Event log** — append-only JSONL at `~/.rue/events/events.jsonl` survives crashes. On restart, the log can be replayed to reconstruct state.
- **Working memory snapshots** — `toSnapshot()` / `fromSnapshot()` allow periodic checkpointing. If the daemon crashes, the last snapshot is restored.
- **Semantic memory** — SQLite with WAL mode handles unclean shutdowns.
- **Identity + user model** — JSON files saved after each mutation. Atomic at the OS level for small files.
- **Agent sessions** — the Claude Agent SDK returns `sessionId` values that can resume interrupted conversations. The daemon tracks these globally (`lastSessionId`) for continuity.
- **Message store** — SQLite-backed (`~/.rue/messages/messages.sqlite`), durable across crashes.

## Event bus and message flow

### Bus design

`EventBus` (`src/bus/bus.ts`) is a typed, in-process pub/sub system. All inter-subsystem communication flows through it.

**Pub/sub:**
- `on(channel, handler)` — subscribe to a typed channel
- `emit(channel, payload)` — fire-and-forget broadcast
- `onWildcard(pattern, handler)` — subscribe to channel prefixes (e.g., `agent:*`)

**Request/reply:**
- `handle(channel, handler)` — register a handler that returns a value
- `request(channel, payload, opts)` — send request, await response with timeout

**Await pattern:**
- `waitFor(channel, opts)` — promise that resolves on next emit to channel

### Channel taxonomy

Channels are defined in `src/bus/channels.ts` with full TypeScript type safety via `BusChannels` interface:

| Prefix | Channels | Purpose |
|--------|----------|---------|
| `agent:` | spawned, progress, completed, failed, stalled, killed | Agent lifecycle events |
| `task:` | created, updated, completed | Task DAG state changes |
| `memory:` | stored, recalled | Memory read/write notifications |
| `identity:` | updated | Identity field changes |
| `system:` | started, shutdown, health | Daemon lifecycle |
| `interface:` | input, output, stream | I/O between interfaces and daemon |
| `message:` | created | Conversation message persistence |

### Persistence

`EventPersistence` (`src/bus/persistence.ts`) writes every emitted event to an append-only JSONL log at `~/.rue/events/events.jsonl`. Each entry has a sequence number, timestamp, channel, and payload. Supports `readTail(n)` and `readSince(seq)` for replay.

### Middleware

`applyMiddleware(bus, middlewares)` wraps the bus with interceptors. Each middleware implements `onEmit` and can transform or filter events before delivery.

### Typical message flow

User sends a chat message:

```
CLI/Web  →  WebSocket frame (cmd: "ask")
         →  handler.ts parses frame
         →  bus.emit("interface:input", {source, text})
         →  assembler.assemble(task) builds system prompt
         →  Claude Agent SDK query() called
         →  streaming tokens emitted as bus("interface:stream")
         →  WebSocket sends stream frames to client
         →  final result → bus.emit("agent:completed")
         →  messageStore.append() persists exchange
         →  bus.emit("message:created")
```

## Agent supervisor and process model

### Supervisor

`AgentSupervisor` (`src/agents/supervisor.ts`) manages the full lifecycle of agent processes.

**States:** `spawning → running → completed | failed | killed | stalled`

**Key operations:**
- `spawn(opts)` — creates agent config, enqueues to lane, starts process
- `kill(id)` — aborts agent via AbortController
- `steer(id, message)` — send guidance to running agent (future)
- `listAgents()` — all handles with current state
- `shutdown()` — kill all agents, drain queues

**Spawn options include:** task description, lane assignment, working directory, custom system prompt, timeout, max turns, parent agent ID, budget cap, allowed tools list.

### Lane queue

`LaneQueue` (`src/agents/lanes.ts`) provides bounded concurrency across four lanes:

| Lane | Concurrency | Purpose |
|------|------------|---------|
| `main` | 1 | Primary user-facing conversation |
| `sub` | 6 | Background sub-agents spawned by other agents |
| `cron` | 2 | Scheduled/recurring tasks |
| `skill` | 2 | Skill execution |

When a lane is at capacity, new tasks queue and drain as slots free. This prevents resource exhaustion while allowing parallel work.

### Process model

`ClaudeProcess` (`src/agents/process.ts`) wraps the Claude Agent SDK `query()` function. Each agent runs as an SDK query call (not a child process) with:

- **AbortController** for cancellation
- **Streaming** via async iterator — yields `stream_event` (token deltas) and `assistant` (full messages)
- **Session tracking** — SDK returns `sessionId` for conversation resumption
- **Cost extraction** — reads `total_cost_usd` from result messages

**SpawnResult** returned on completion:
```typescript
{
  output: string       // final text output
  exitCode: number     // 0 = success
  cost: number         // USD spent
  durationMs: number
  sessionId?: string   // for resumption
  numTurns?: number
  usage?: object       // token counts
}
```

### Health monitoring

`HealthMonitor` (`src/agents/health.ts`) watches for stalled agents:
- Tracks last output timestamp per agent
- Polls on interval (configurable, default 60s threshold)
- Emits `agent:stalled` on the bus when an agent goes silent
- Supervisor can then kill or nudge the agent

### Resource governance

`ResourceGovernor` (`src/agents/governor.ts`) enforces cost budgets:
- Per-agent cost tracking
- Daily aggregate ceiling (default $10)
- Warning at 80% of budget
- `isBudgetExceeded()` checked before spawning new agents

## Claude Agent SDK integration

The SDK (`@anthropic-ai/claude-agent-sdk`) is the sole interface to Claude. It is imported dynamically to keep the module optional during testing.

### Usage in handler (interactive chat)

`handler.ts` uses the SDK for user-facing conversations:

```typescript
const { query } = await import("@anthropic-ai/claude-agent-sdk");
const conversation = query({
  prompt: userMessage,
  cwd: projectRoot,
  systemPrompt: await assembler.assemble(task),
  tools: { preset: "claude_code" },
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  includePartialMessages: true,
  resume: lastSessionId,      // conversation continuity
  settingSources: [],          // don't load user's Claude Code config
});
```

Messages are iterated asynchronously. `stream_event` messages with `text_delta` content are forwarded to the client in real-time. The `result` message provides final cost. `sessionId` is stored globally for session resumption.

### Usage in process (autonomous agents)

`process.ts` uses the same SDK for autonomous task execution with additional constraints:

- `maxTurns` — limits agent iterations
- `maxBudgetUsd` — per-agent spend cap
- `allowedTools` — restrict tool access per task
- `abortController` — external kill switch

### Tool configuration

Agents get access to: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Agent (for spawning sub-agents). The `Agent` tool usage is tracked — when a sub-agent spawns, the supervisor emits `agent:spawned` and manages it through the same lane/process infrastructure.

## Storage layout

All persistent state lives under `~/.rue/`:

```
~/.rue/
├── config.json                          # daemon configuration
├── events/
│   └── events.jsonl                     # append-only event log
├── messages/
│   └── messages.sqlite                  # conversation history
├── memory/
│   └── semantic/
│       └── knowledge.sqlite             # long-term facts
├── identity/
│   ├── identity.json                    # agent identity
│   └── user-profile.json               # learned user model
└── workspace/
    └── projects/
        └── <name>/                      # managed projects
            ├── PROJECT.md
            ├── AGENTS.md
            ├── config.json
            ├── docs/
            ├── tasks/
            └── work/
```

## Skills

Skills are filesystem-based CLI tools in `skills/`. Each skill directory contains:
- `SKILL.md` — description, usage, and examples
- `run.ts` — executable entry point

The context assembler discovers skills at prompt assembly time and injects their descriptions into the system prompt. Current skills:

- **projects** — managed workspaces with task boards and auto-spawning agents
- **schedule** — timed jobs and reminders
- **triggers** — event-driven automation ("when X happens, do Y")
- **list-skills** — self-discovery of available skills

## Protocol

Communication between clients and daemon uses a frame-based WebSocket protocol defined in `src/daemon/protocol.ts` with Zod validation.

**Client → Daemon (ClientFrame):**
- `cmd` — execute command (ask, reset, history, status, agents)
- `steer` — send guidance to a running agent
- `kill` — abort an agent
- `subscribe` — subscribe to event channels

**Daemon → Client (DaemonFrame):**
- `ack` — command received
- `stream` — partial output (real-time tokens)
- `event` — bus event forwarded to client
- `result` — final command result
- `error` — error response
- `notify` — proactive notification

Each frame gets a unique ID (`frame_<nanoid>`) for request/response correlation.
