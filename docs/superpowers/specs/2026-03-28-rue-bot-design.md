# Rue Bot — Design Specification

An always-on TypeScript daemon that uses Claude Code as its AI engine to orchestrate autonomous agents, manage a self-evolving skill system, and maintain persistent memory and evolving identity.

## Goals

- Developer-first agent that spawns and orchestrates Claude Code subprocesses for coding, research, and complex multi-step work
- Personal assistant capabilities (calendar, reminders, planning) via dynamically generated skills
- Full real-time visibility into agent activity without requiring intervention
- Memory and identity that persist and evolve across all interactions
- CLI-first interface, with messaging channels (Telegram, WhatsApp, etc.) as a future addition

## Non-Goals (for v0.1)

- Messaging channel adapters (future)
- Interactive TUI with panels (future)
- Skill engine with generation/promotion (future — v0.1 uses pure Claude Code reasoning)
- Pulse system / heartbeat / cron (future — v0.1 is manual-only)
- Identity evolution via reflection cycles (future — v0.1 uses static identity)
- Event replay / crash recovery (future)
- Web dashboard (future)

---

## Architecture: The Cortex

Three-layer brain architecture connected by a typed event bus.

### Layer 1: Prefrontal (Planning & Orchestration)

Receives high-level goals, decomposes them into task DAGs (directed acyclic graphs). Decides what agents to spawn, in what order, with what dependencies. Monitors progress and re-plans when things fail. This is itself a Claude Code agent that uses Claude's reasoning to plan.

Responsibilities:
- Task decomposition: break "refactor auth module" into analyze → refactor → update tests → verify
- Dependency resolution: parallel where possible, sequential where needed
- Progress monitoring: track DAG node completion via event bus
- Re-planning: when an agent fails, decide whether to retry, reassign, or adjust the plan
- Skill-aware planning: knows what skills exist and composes them into task graphs

### Layer 2: Limbic (Identity, Memory & Context)

Owns the agent's evolving identity and all memory systems. Provides context assembly for every agent turn.

#### Memory System — Three Types

**Episodic Memory** (what happened):
- Built from the event bus log (event sourcing)
- Raw events periodically summarized into episode summaries
- Queryable by time, topic, outcome
- Storage: `~/.rue/memory/episodic/` — append-only event log + summaries

**Semantic Memory** (what I know):
- Facts, patterns, preferences extracted from episodes
- SQLite with vector embeddings for semantic search
- Continuously updated — new facts override old ones
- Storage: `~/.rue/memory/semantic/knowledge.sqlite`

**Working Memory** (what I'm thinking now):
- In-memory only, rebuilt on restart from event log tail
- Current active tasks, agent states, pending decisions
- Storage: `~/.rue/memory/working/state.json` (snapshot only)

#### Context Assembler

For each agent turn, assembles a tailored, right-sized context:
1. Identity prompt (who am I)
2. Relevant episodic memories (what happened before)
3. Relevant semantic facts (what I know)
4. Working memory (current state)
5. User model (who they are, how to communicate)
6. Relevant skills (what I can do)

Token budget allocation: distributes tokens across categories based on task type. Simple question = small context. Complex refactor = large context with more episodic and skill content.

#### Identity System

**Identity Core**: starts unnamed with a base personality. Evolves through interaction. Fields: name (null initially), personality_base, communication_style, values, expertise_areas, quirks.

**User Model**: learned profile of the user. Fields: name, expertise map, preferences, work patterns, current projects, communication style.

**Identity Evolution Engine** (v0.2+): after each interaction, extracts signals (corrections, praise, frustration). Periodically runs reflection cycles (scheduled agent turn that reviews recent interactions and proposes identity updates). Identity changes are versioned in the event log.

### Layer 3: Cerebellum (Execution & Skills)

Manages the skill lifecycle and handles scheduling.

#### 3-Tier Skill System (v0.2+, described here for completeness)

**Tier 1 — Ad-hoc**: Generated on the fly when no existing skill matches. Agent solves the task, pattern extracted from execution trace, saved temporarily. Auto-deleted after 7 days if not reused.

**Tier 2 — Reuse**: When a Tier 1 pattern is detected a second time, promoted to Tier 2. Persisted with metadata, triggers, and learned context. Decays in ranking if unused for 30 days.

**Tier 3 — Promoted**: After 3+ uses with >80% success rate, or explicit user promotion ("remember how to do this"). Validated, tested, versioned, permanent. Can be manually retired.

Skill anatomy (markdown with YAML frontmatter):
```yaml
---
name: skill-name
description: what it does
tier: 1 | 2 | 3
version: 1
created: ISO-8601
lastUsed: ISO-8601
useCount: number
successRate: number
tags: [string]
triggers: [glob patterns]
dependencies:
  bins: [required binaries]
  env: [required env vars]
generatedBy: trace-id
---
## Purpose
## Steps
## Context
## Learned Refinements
```

**Skill Engine** components:
- Matcher: searches existing skills by triggers + semantic similarity + tags
- Generator: spawns Claude Code agent to solve task and extract pattern
- Compiler: validates and promotes Tier 2 → Tier 3
- Ranker: scores by recency (0.2), frequency (0.2), success rate (0.3), semantic match (0.3)
- Store: filesystem (`~/.rue/skills/tier{1,2,3}/`) + SQLite index

Skills can reference other skills (composition). Prefrontal handles decomposition into skill chains.

#### Pulse System (v0.2+, described for completeness)

Unified scheduler replacing OpenClaw's separate hooks/cron/heartbeat:

Pulse types:
- HEARTBEAT: periodic check-in ("every 30m, check if anything needs attention")
- CRON: time-based ("at 9am every Monday, generate weekly summary")
- WATCH: file system watcher ("when src/**/*.ts changes, run tests")
- HOOK: event-driven ("after agent completes, extract learnings")
- DEFERRED: one-shot timer ("in 2 hours, remind me about the deploy")
- REACTIVE: event bus trigger ("when event X fires, do Y")

Cheap-checks gate: before any pulse fires an agent turn (costs money), run zero-cost deterministic checks (file watchers, git status, process checks, time checks). Only spawn agent if a check fires.

Budget governor: every pulse has a per-run budget. Tracks cumulative daily spend. Warns at 80%, hard-stops at 100%. Global daily ceiling (default $10).

---

## Event Bus

The nervous system connecting all layers. In-process typed pub/sub with event sourcing.

### Patterns

- `emit()` — fire-and-forget broadcast
- `request()` — typed request/reply with timeout
- `stream()` — continuous event stream (agent output)
- `query()` — request to memory/state, returns data

### Features

- Typed channels (compile-time safety on event payloads)
- Event sourcing — every event persisted to append-only log
- Middleware pipeline (intercept, transform, audit)
- Backpressure — slow consumers don't block producers
- Replay — rebuild state from event history
- Wildcards — subscribe to `agent:*` for all agent events
- Periodic compaction (old events summarized to prevent unbounded growth)

### Channel Definitions

```
agent:spawned     agent:progress    agent:completed
agent:failed      agent:output      agent:heartbeat
task:created      task:updated      task:completed
skill:generated   skill:promoted    skill:invoked
memory:stored     memory:recalled   memory:evolved
identity:updated  identity:learned
system:health     system:started    system:shutdown
interface:input   interface:output  interface:stream
pulse:fired       pulse:completed
```

### Agent Communication via Bus

Agents are peers on the bus, not just children calling home:
- Broadcast needs ("I need test results for module X")
- Direct message specific agents by ID
- Stream progress to supervisor and UI simultaneously
- Subscribe to other agents' output streams

Results from subagents are push-based (like OpenClaw) — parent doesn't poll.

---

## Agent Supervisor & Process Model

Claude Code agents run as real subprocesses (not in-process like OpenClaw's PiEmbeddedRunner).

### Subprocess Interface

Each agent is spawned via the `@anthropic-ai/claude-code` SDK package for programmatic control (streaming output, tool configuration, session management). Falls back to `claude --print` CLI mode if SDK is unavailable.
- Session file for persistent context
- System prompt assembled by Limbic layer
- Working directory (can be a git worktree for isolation)
- Allowed tools configured per task type
- Timeout and max turns

### Spawn Config

```typescript
interface AgentConfig {
  id: string;
  task: string;
  lane: Lane;              // main | sub | cron | skill
  workdir: string;
  systemPrompt: string;
  skills: SkillRef[];
  timeout: number;
  maxTurns: number;
  parentId?: string;
  budget?: number;
}
```

### Process Lifecycle

States: SPAWNING → INITIALIZING → RUNNING → COMPLETING → CLEANUP

Error states: STALLED (no output for configurable period), FAILED (non-retryable error), KILLED (manually or by governor).

REJECTED: resource limit hit, task goes back to queue.

Stall detection:
1. No output for configurable period → send nudge via stdin
2. Still silent → capture state and kill
3. Report to Prefrontal for re-planning

Crash recovery:
1. Capture exit code and last output
2. Retryable (OOM, network) → respawn with same session file
3. Persistent failure → escalate to Prefrontal

### Lane-Based Queue

Lanes with configurable concurrency:
- `main`: 1 (user-facing, always gets priority)
- `sub`: 6 (parallel worker agents)
- `cron`: 2 (background scheduled tasks)
- `skill`: 2 (skill generation/compilation)

### Resource Governor

- Max concurrent agents: configurable (default 8)
- Memory ceiling: monitors RSS of child processes
- Priority: main lane always gets resources first
- Cost tracking: per-agent, per-task token usage with configurable budgets

### Task DAG Execution

Prefrontal creates dependency graphs. Supervisor executes respecting DAG ordering. Completed outputs fed as context to dependent tasks. Parallel execution where no dependencies exist.

---

## Daemon Lifecycle

### Installation

`rue daemon install` creates launchd plist (macOS) or systemd unit (Linux) for auto-start on boot.

### Startup Sequence

1. Load config from `~/.rue/config.json`
2. Replay event log tail → rebuild working memory
3. Start WebSocket server on `localhost:18800`
4. Start Pulse system (v0.2+)
5. Resume any interrupted agent tasks (v0.2+)
6. Emit `system:started` on event bus

### Graceful Shutdown

1. Stop accepting new tasks
2. Drain lane queues (wait up to 30s)
3. Send SIGTERM to agent subprocesses
4. Persist working memory snapshot
5. Flush event log
6. Close WebSocket server

### CLI ↔ Daemon Protocol

WebSocket on `localhost:18800`. JSON frames:

```typescript
// Client → Daemon
type ClientFrame =
  | { type: "cmd"; id: string; cmd: string; args: Record<string, unknown> }
  | { type: "steer"; agentId: string; message: string }
  | { type: "kill"; agentId: string }
  | { type: "subscribe"; channels: string[] }

// Daemon → Client
type DaemonFrame =
  | { type: "ack"; id: string }
  | { type: "stream"; agentId: string; chunk: string }
  | { type: "event"; channel: string; payload: unknown }
  | { type: "result"; id: string; data: unknown }
  | { type: "error"; id: string; code: string; message: string }
  | { type: "notify"; severity: string; title: string; body: string }
```

### CLI Commands

```
rue ask "..."             Send task to daemon
rue status                Active agents, queue, recent events
rue agents                List running agents with progress
rue skills                List skills by tier with stats
rue memory "query"        Search memory
rue pulse                 Pulse schedule and recent triggers
rue log                   Tail the event log
rue cost                  Today's spend breakdown
rue config                Edit config
rue steer <id> "msg"      Inject guidance into running agent
rue kill <id>             Stop a specific agent
rue pause                 Pause all agents
rue resume                Resume paused agents
rue daemon start|stop|restart|install|uninstall
```

---

## Interface & Visibility

### Interactive Mode (v0.2+)

Full TUI with split panes: chat on the left, agent panel on the right showing live status of all agents, resource usage, and cost.

### Command Mode (v0.1)

One-shot commands that print and exit. `rue ask` streams agent output to stdout.

### Notifications

Channels: macOS notifications (osascript), terminal bell, log file. Future: messaging channels.

Severity levels:
- info: logged only
- notify: macOS notification
- alert: notification + terminal bell
- urgent: all channels + persists until acknowledged

Triggers: task completed, task failed, agent stuck, budget threshold, pulse completed, agent needs input.

---

## Project Structure

```
rue-bot/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                       Entry point
│   ├── daemon/                        Daemon lifecycle
│   │   ├── server.ts                  WebSocket server, startup/shutdown
│   │   ├── protocol.ts                Frame types, serialization
│   │   ├── install.ts                 launchd/systemd integration
│   │   └── health.ts                  Self-health monitoring
│   ├── bus/                           Event bus
│   │   ├── bus.ts                     Core pub/sub + request/reply
│   │   ├── channels.ts                Typed channel definitions
│   │   ├── middleware.ts              Intercept, transform, audit
│   │   ├── persistence.ts            Event log append + compaction
│   │   └── replay.ts                 State rebuild from events
│   ├── cortex/                        Brain layers
│   │   ├── prefrontal/                Planning & orchestration
│   │   │   ├── planner.ts             Task decomposition into DAGs
│   │   │   ├── dag.ts                 DAG data structure & execution
│   │   │   └── replan.ts             Re-planning on failure
│   │   ├── limbic/                    Identity & memory
│   │   │   ├── memory/
│   │   │   │   ├── episodic.ts        Event log → episode summaries
│   │   │   │   ├── semantic.ts        SQLite + vector fact store
│   │   │   │   ├── working.ts         In-memory current state
│   │   │   │   └── assembler.ts       Context assembly with budget
│   │   │   ├── identity/
│   │   │   │   ├── core.ts            Identity state & prompt gen
│   │   │   │   ├── user-model.ts      User profile & preferences
│   │   │   │   └── evolution.ts       Reflection cycles
│   │   │   └── index.ts
│   │   └── cerebellum/                Execution & skills
│   │       ├── skills/
│   │       │   ├── engine.ts          Match → generate → promote
│   │       │   ├── matcher.ts         Trigger + semantic matching
│   │       │   ├── generator.ts       Ad-hoc skill generation
│   │       │   ├── compiler.ts        T2→T3 validation & promotion
│   │       │   ├── ranker.ts          Scoring & selection
│   │       │   └── store.ts           Filesystem + SQLite index
│   │       ├── scheduler/
│   │       │   ├── pulse.ts           Unified pulse system
│   │       │   ├── checks.ts          Cheap-checks gate
│   │       │   └── budget.ts          Cost governor
│   │       └── index.ts
│   ├── agents/                        Agent supervisor
│   │   ├── supervisor.ts              Process pool, spawn, kill
│   │   ├── process.ts                 Claude Code subprocess wrapper
│   │   ├── lanes.ts                   Lane-based queue
│   │   ├── governor.ts                Resource limits
│   │   ├── health.ts                  Stall detection, crash recovery
│   │   └── types.ts                   Agent config, lifecycle states
│   ├── interfaces/                    User-facing
│   │   ├── cli/
│   │   │   ├── commands.ts            CLI command definitions
│   │   │   ├── tui.ts                 Interactive mode (v0.2+)
│   │   │   ├── panels.ts             Agent panel, resources (v0.2+)
│   │   │   └── client.ts             WebSocket client to daemon
│   │   └── channels/
│   │       └── adapter.ts             Channel adapter interface
│   └── shared/
│       ├── config.ts                  Config loading & validation
│       ├── logger.ts                  Structured logging
│       ├── cost.ts                    Token/cost tracking
│       └── errors.ts                  Error types
├── tests/
│   ├── bus/
│   ├── cortex/
│   ├── agents/
│   └── interfaces/
└── data/                              Runtime data (gitignored)
```

### Module Dependency Rules

- Everything talks through the bus — no direct cross-layer imports except shared types
- Bus depends on nothing — pure infrastructure
- Agents know nothing about cortex — they're just process wrappers
- Cortex layers talk through the bus — prefrontal doesn't import limbic directly
- Interfaces only talk to daemon — via WebSocket protocol

---

## Storage Layout

```
~/.rue/
├── config.json                    Main configuration
├── events/
│   └── events.log                 Append-only event log (source of truth)
├── memory/
│   ├── episodic/
│   │   └── summaries/             Periodic episode summaries
│   ├── semantic/
│   │   └── knowledge.sqlite       Facts + vector embeddings
│   └── working/
│       └── state.json             Working memory snapshot
├── identity/
│   ├── core.json                  Current identity state
│   ├── user-model.json            Current user model
│   └── evolution.log              Identity change history
├── skills/
│   ├── tier1/                     Ephemeral, auto-cleaned
│   ├── tier2/                     Persisted, ranked
│   ├── tier3/                     Permanent, versioned
│   └── index.sqlite               Search index + embeddings
├── agents/
│   └── sessions/                  Per-agent session files
├── pulses/
│   ├── config.yaml                Pulse definitions
│   └── runs/                      Run history
└── logs/
    └── daemon.log                 Daemon process log
```

---

## v0.1 Scope

What gets built first (minimal viable version):

1. **Bus** — event pub/sub + file persistence
2. **Daemon** — WebSocket server, startup/shutdown lifecycle
3. **Agents** — supervisor + Claude Code subprocess wrapper + lane queue
4. **CLI** — `rue ask`, `rue status`, `rue agents` (command mode, streaming output)
5. **Limbic basics** — semantic memory (SQLite), static identity, context assembler
6. **Prefrontal basics** — single-level task decomposition (no nested DAGs)

## v0.2 Scope

- Interactive TUI with agent panels
- Skill engine (3-tier generate/reuse/promote)
- Pulse system (heartbeat, cron, watchers)
- Identity evolution (reflection cycles)
- Event replay / crash recovery
- Notifications (macOS)

## v0.3 Scope

- Messaging channel adapters (Telegram first)
- Web dashboard
- Skill composition and chaining
- Advanced DAG execution (nested, dynamic replanning)
- Multi-workspace support

---

## Key Differences from OpenClaw

| Aspect | OpenClaw | Rue Bot |
|--------|----------|---------|
| Architecture | Monolithic Gateway (55KB server.impl.ts) | Layered Cortex with event bus |
| Agent runtime | In-process async tasks (PiEmbeddedRunner) | Out-of-process Claude Code subprocesses |
| Communication | Direct function calls + hooks | Typed event bus with pub/sub, request/reply, streaming |
| Skills | Static files, manual creation, unvetted registry | Dynamic 3-tier system: generate → reuse → promote |
| Memory | Fragile (lost on disconnect), plugin-based | First-class 3-type system: episodic + semantic + working |
| Identity | Static SOUL.md file | Evolving identity with reflection cycles |
| Scheduling | 3 separate systems (hooks, cron, heartbeat) | Unified Pulse system with cheap-checks gate |
| Cost control | None built-in | Per-agent, per-task, per-pulse budgets with governor |
| Visibility | No progress indicators | Real-time agent panels, streaming output, event log |
| State persistence | Session lost on disconnect | Event-sourced, rebuildable from log |
| Config | Complex openclaw.json | Minimal config.json, most behavior is learned |
