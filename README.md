# Rue Bot

An always-on AI agent daemon powered by the Claude Agent SDK. Rue runs as a persistent background service, spawning sub-agents for parallel work, managing projects with task boards, and accumulating memory across sessions.

## Quick Start

```bash
# Prerequisites: Node.js >= 22
npm install

# Run in development mode
npm run dev

# Run the web dashboard
cd web && npm run dev

# Build
npm run build

# Run tests
npm run test

# Type check
npx tsc --noEmit
```

The daemon starts on port **18800** by default. Configuration lives at `~/.rue/config.json`.

## Architecture

```
rue-bot/
├── src/
│   ├── daemon/       # HTTP + WebSocket server, command handler, protocol
│   ├── cortex/       # Brain-inspired memory & reasoning
│   │   ├── limbic/   # Semantic memory, working memory, identity, user model
│   │   └── prefrontal/ # Task planner, DAG execution
│   ├── agents/       # Supervisor, lane queue, Claude process wrapper
│   ├── bus/          # Event bus (pub/sub with typed channels)
│   ├── interfaces/   # CLI commands, WebSocket client
│   ├── messages/     # SQLite-backed message persistence
│   └── shared/       # Config, types, utilities
├── web/              # React dashboard (Vite + Tailwind)
├── skills/           # Pluggable CLI tools (projects, schedule, triggers)
├── prompts/          # SYSTEM.md and PERSONALITY.md
└── tests/            # Vitest test suite
```

### Core Components

**Daemon** — HTTP server with WebSocket support. Handles `cmd:ask`, `cmd:reset`, `cmd:history`, `cmd:status`, plus agent steering and event subscriptions.

**Cortex** — Bio-inspired memory system. Semantic memory (persistent facts in SQLite), working memory (session state), identity core (evolving personality), and user model (preferences, expertise). The context assembler builds dynamic system prompts from all of these.

**Agents** — Supervisor manages agent lifecycle (spawn, steer, kill). Lane queue controls concurrency across four lanes: main (1), sub (6), cron (2), skill (2). Each agent wraps the Claude Agent SDK with full tool access.

**Event Bus** — Typed pub/sub channels for system-wide coordination. Events include `agent:spawned`, `agent:completed`, `task:created`, `memory:stored`, and more.

**Skills** — Filesystem-based CLI tools that extend Rue's capabilities. Each skill has a `SKILL.md` description and a `run.ts` entry point. Built-in skills: projects, schedule, triggers, list-skills.

**Web Dashboard** — React SPA with real-time chat, project browser, agent monitor, and settings. Connects to the daemon over WebSocket for streaming responses.

### How It Works

1. User sends a message via CLI or web dashboard
2. The context assembler builds a system prompt from memory, identity, and personality
3. Rue processes the request directly or spawns sub-agents for parallel work
4. Events propagate through the bus; messages persist in SQLite
5. The web dashboard streams progress in real-time
6. For sustained work, Rue creates projects with task boards — each task auto-spawns an agent

## API

### REST Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/projects` | List all projects |
| `GET /api/projects/:name` | Project details |
| `GET /api/projects/:name/tasks` | Tasks with status |
| `GET /api/history` | Message history |
| `GET /api/status` | Running agents |

### WebSocket Commands

| Command | Description |
|---------|-------------|
| `cmd:ask` | Send a prompt to Rue |
| `cmd:reset` | Clear session state |
| `cmd:history` | Fetch recent messages |
| `cmd:status` | Get agent status |
| `subscribe` | Subscribe to event channels |
| `steer` | Send input to a running agent |
| `kill` | Terminate an agent |

## Configuration

Default config at `~/.rue/config.json`:

```jsonc
{
  "port": 18800,        // Daemon port
  "dataDir": "~/.rue",  // Data storage directory
  "lanes": {            // Concurrency per lane
    "main": 1,
    "sub": 6,
    "cron": 2,
    "skill": 2
  }
}
```

## Development

```bash
npm run dev          # Run daemon with hot reload (tsx)
npm run test         # Run tests (vitest)
npm run test:watch   # Watch mode
npm run lint         # Type check (tsc --noEmit)
npm run build        # Compile to dist/
```

## License

MIT
