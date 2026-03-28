# Development Guide

## Prerequisites

- **Node.js >= 22.0.0** (required — uses ES2022 features and native fetch)
- **npm** (bundled with Node)
- **Claude Agent SDK API key** — needed at runtime for agent processing

Verify your Node version:

```bash
node --version  # must be v22.x or higher
```

## Setup

```bash
# Clone the repository
git clone <repo-url> rue-bot
cd rue-bot

# Install root dependencies
npm install

# Install web dashboard dependencies
cd web && npm install && cd ..

# Build the TypeScript source
npm run build

# Verify everything works
npx vitest run
npx tsc --noEmit
```

## Running

### Daemon (development mode)

```bash
npm run dev
```

Starts the daemon on port **18800** with hot reload via `tsx`. The daemon exposes an HTTP API and WebSocket server.

### Web dashboard

```bash
cd web
npm run dev
```

Launches the Vite dev server for the React dashboard. It connects to the daemon over WebSocket for real-time streaming.

### Production build

```bash
npm run build       # compiles src/ to dist/
cd web && npm run build  # builds the web dashboard
```

## Testing

Tests use **vitest** with globals enabled. Test files live in `tests/` and mirror the `src/` directory structure.

```bash
npm run test         # single run
npm run test:watch   # watch mode — re-runs on file changes
npx vitest run       # equivalent to npm run test
```

Type checking (no emit):

```bash
npm run lint         # runs tsc --noEmit
npx tsc --noEmit     # equivalent
```

### Writing tests

- Place tests in `tests/` mirroring the source path (e.g., `src/bus/bus.ts` → `tests/bus/bus.test.ts`)
- Tests use vitest globals (`describe`, `it`, `expect`) — no imports needed
- Test timeout is 10 seconds per test
- All changes require test coverage

## Project Structure

```
rue-bot/
├── src/                          # Daemon source code (TypeScript, strict mode, ESM)
│   ├── index.ts                  # CLI entry point
│   ├── daemon/                   # HTTP + WebSocket server
│   │   ├── server.ts             # Main server (port 18800)
│   │   ├── handler.ts            # Command handler, Claude SDK integration
│   │   └── protocol.ts           # WebSocket protocol definitions
│   ├── cortex/                   # Brain-inspired memory & reasoning
│   │   ├── limbic/               # Semantic memory, working memory, identity
│   │   │   ├── identity/         # Evolving personality & user model
│   │   │   └── memory/           # Assembler, semantic store, working memory
│   │   └── prefrontal/           # Task planner, DAG execution
│   ├── agents/                   # Agent lifecycle & concurrency
│   │   ├── supervisor.ts         # Spawns and manages agents
│   │   ├── process.ts            # Claude Agent SDK subprocess wrapper
│   │   ├── lanes.ts              # Lane-based concurrency queue
│   │   ├── governor.ts           # Agent routing
│   │   └── health.ts             # Agent health checks
│   ├── bus/                      # Typed event bus (pub/sub)
│   ├── interfaces/               # CLI client, TUI components
│   ├── messages/                 # SQLite-backed message store
│   └── shared/                   # Config, types, errors, logging
├── web/                          # React dashboard (Vite + Tailwind CSS)
│   └── src/
│       ├── components/           # Layout, shared UI components
│       └── pages/                # Route-based pages
├── skills/                       # Pluggable CLI tools
│   ├── projects/                 # Project & task management
│   ├── schedule/                 # Timed job scheduling
│   ├── triggers/                 # Event-driven automation
│   └── list-skills/              # Skill discovery
├── prompts/                      # Agent prompts
│   ├── SYSTEM.md                 # System prompt
│   └── PERSONALITY.md            # Personality definition
├── tests/                        # Vitest test suite (mirrors src/)
├── docs/                         # Documentation
├── tsconfig.json                 # TypeScript config (strict, ES2022, Node16)
└── vitest.config.ts              # Test configuration
```

### Key concepts

- **Daemon** — persistent HTTP + WebSocket server that processes user messages, manages agents, and streams responses
- **Cortex** — layered memory system: semantic (long-term facts in SQLite), working (session state), identity (evolving personality), user model (preferences)
- **Agents** — concurrent Claude sub-processes managed by a supervisor, throttled through four lanes: main (1), sub (6), cron (2), skill (2)
- **Event bus** — typed pub/sub channels for system-wide coordination
- **Skills** — each skill is a directory under `skills/` with a `SKILL.md` description and `run.ts` entry point

## Configuration

Runtime config lives at `~/.rue/config.json`:

```jsonc
{
  "port": 18800,
  "dataDir": "~/.rue",
  "lanes": {
    "main": 1,
    "sub": 6,
    "cron": 2,
    "skill": 2
  }
}
```

Data (SQLite databases, project files) is stored under `~/.rue/`.

## Contributing

1. **Check existing code** — look at nearby files before writing new code to match existing patterns
2. **TypeScript strict mode** — all source uses strict mode with ESM modules; no unused locals or parameters
3. **Write tests** — every change needs test coverage; place tests in `tests/` mirroring `src/`
4. **Run checks before committing:**
   ```bash
   npx vitest run      # tests pass
   npx tsc --noEmit    # types check
   ```
5. **Commit messages** — use descriptive messages that explain *why*, not just *what*
6. **Skills** — to add a new skill, create a directory under `skills/` with `SKILL.md` and `run.ts`
