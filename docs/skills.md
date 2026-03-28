# Skills System

Skills are Rue's extensible capabilities — self-contained CLI tools that live in the `skills/` directory. Each skill is a standalone TypeScript program that Rue discovers automatically and invokes via Bash when needed.

Skills are the primary way to extend what Rue can do. They run as subprocesses, so they're isolated and composable. Any agent (main or sub-agent) can use any skill.

## Directory structure

Each skill is a directory under `skills/` containing exactly two files:

```
skills/
  schedule/
    SKILL.md        # Documentation: what it does, usage, when to use
    run.ts          # CLI tool implementation (TypeScript)
  triggers/
    SKILL.md
    run.ts
  projects/
    SKILL.md
    run.ts
  list-skills/
    SKILL.md
    run.ts
```

### SKILL.md

A markdown file describing the skill. Structure:

```markdown
# skill-name

One-line description used for discovery.

## Usage

Command examples and syntax.

## When to use

Guidance on when the agent should reach for this skill.
```

The first non-empty line after the heading is extracted as the skill's summary during discovery.

### run.ts

A standalone TypeScript CLI tool. It parses `process.argv`, performs its work, and writes output to stdout. Skills are executed with:

```bash
node --import tsx/esm skills/<skill-name>/run.ts <command> [args]
```

The working directory is always the rue-bot project root.

**Conventions:**
- Parse args from `process.argv.slice(2)` (no framework required)
- Use a helper like `getArg(flag)` for named arguments
- Exit with code 0 on success, non-zero on failure
- Print meaningful output so the agent can interpret results
- Use `better-sqlite3` for persistent state (store in `~/.rue/`)

## How the agent discovers skills

Discovery happens in the context assembler (`src/cortex/limbic/memory/assembler.ts`):

1. The `discoverSkills()` method scans the `skills/` directory
2. For each subdirectory, it reads `SKILL.md` and extracts the name and description
3. A "Detected Skills" section is injected into the agent's system prompt
4. The agent sees all available skills and their descriptions in every conversation

This means adding a new skill is zero-config — drop files in the directory and it's live.

## How the agent uses skills

1. The agent sees available skills listed in its context
2. When a skill is needed, it reads the skill's `SKILL.md` for exact syntax
3. It runs the skill via Bash: `node --import tsx/esm skills/<name>/run.ts <command> [args]`
4. It interprets the stdout output and acts on the results

Skills run in the `"skill"` lane (configurable concurrency, default 2 concurrent skill agents).

## Creating a new skill

1. Create a directory: `skills/<your-skill>/`
2. Write `SKILL.md` with a heading, description, usage, and guidance
3. Write `run.ts` implementing the CLI interface
4. That's it — Rue discovers it automatically on next context assembly

**Example minimal skill:**

`skills/hello/SKILL.md`:
```markdown
# hello

Greet someone by name.

## Usage

  node --import tsx/esm skills/hello/run.ts <name>

## When to use

When the user asks you to greet someone.
```

`skills/hello/run.ts`:
```typescript
const name = process.argv[2] ?? "world";
console.log(`Hello, ${name}!`);
```

## Built-in skills

### projects

Manage project workspaces with task boards and agent delegation.

**Storage:** `~/.rue/workspace/projects/<name>/`

Each project contains:
- `config.json` — metadata (name, description, maxAgents, status, tags)
- `PROJECT.md` — project goals and context
- `AGENTS.md` — instructions for agents working on the project
- `tasks/` — numbered markdown files with YAML frontmatter (id, status, agent, timestamps)
- `docs/` — project knowledge base
- `work/` — working directory (e.g., cloned repos)

**Commands:**
| Command | Description |
|---------|-------------|
| `create` | Create a new project (optionally clone a git repo) |
| `list` | List all projects with task counts |
| `status` | Show project details and all tasks |
| `add-task` | Add a task (emits event for auto-agent-spawning) |
| `update-task` | Update task status or agent assignment |
| `archive` | Archive a project |

**Agent auto-spawning:** When a task is added, the daemon's task watcher (polling every 10s) detects unassigned `todo` tasks and spawns agents automatically, respecting the project's `maxAgents` limit.

### schedule

Create timed jobs — recurring intervals or one-shot delays.

**Storage:** `~/.rue/schedules/jobs.sqlite`

**Schedule formats:**
- `every Nm` / `every Nh` — recurring every N minutes/hours
- `in Nm` / `in Nh` — one-shot, runs once after a delay

The daemon checks for due jobs every 30 seconds. When a job fires, it creates a push message that the agent sees and acts on.

**Commands:**
| Command | Description |
|---------|-------------|
| `create` | Create a scheduled job |
| `list` | List all jobs with last/next run times |
| `remove` | Delete a job by ID |
| `toggle` | Pause or resume a job |

### triggers

Event-driven automation: "when X happens, do Y."

**Storage:** `~/.rue/triggers/triggers.sqlite`

**Available events:**
| Event | Fires when |
|-------|-----------|
| `agent:spawned` | An agent is created |
| `agent:completed` | An agent finishes successfully |
| `agent:failed` | An agent errors |
| `message:created` | A message is added to the store |
| `task:completed` | A task DAG finishes |
| `system:started` | The daemon starts |
| `system:shutdown` | The daemon is shutting down |

**Conditions:** Use `*` to fire on any event of that type, or a JSON partial match (e.g., `{"role":"push"}`) to filter.

When a trigger fires, it creates a push message for the agent.

**Commands:**
| Command | Description |
|---------|-------------|
| `create` | Create a trigger |
| `list` | List all triggers with fire counts |
| `remove` | Delete a trigger by ID |
| `toggle` | Enable or disable a trigger |

### list-skills

Discover all available skills. Scans the `skills/` directory, reads each `SKILL.md`, and outputs a formatted list with names and descriptions. No subcommands — just run it.

```bash
node --import tsx/esm skills/list-skills/run.ts
```
