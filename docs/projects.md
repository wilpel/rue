# Projects System

Rue's project system organizes multi-task work into self-contained directories. Each project has its own config, tasks, agent instructions, and working directory. The daemon automatically picks up `todo` tasks and spawns agents to complete them.

## Project directory structure

Projects live under `~/.rue/workspace/projects/`. Each project is a directory:

```
~/.rue/workspace/projects/<project-name>/
├── config.json        # Project metadata and settings
├── PROJECT.md         # Goals, context, approach (user-written)
├── AGENTS.md          # System prompt for spawned agents
├── docs/
│   └── notes.md       # Running log of discoveries
├── tasks/
│   ├── 001-setup.md           # Task files (YAML frontmatter + markdown)
│   ├── 002-implement-api.md
│   └── ...
└── work/              # Working directory for agents
    └── (cloned repos, generated files, etc.)
```

Create a project with the `projects` skill:

```
projects create my-api "REST API for task management"
```

## config.json

Each project has a `config.json` at its root:

```json
{
  "name": "my-api",
  "description": "REST API for task management",
  "maxAgents": 2,
  "status": "active",
  "tags": [],
  "created": "2026-03-28T21:10:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Project identifier (matches directory name) |
| `description` | string | Short summary of the project |
| `maxAgents` | number | Max concurrent agents working on this project |
| `status` | `"active"` \| `"archived"` | Only active projects get tasks auto-assigned |
| `tags` | string[] | Freeform tags for organization |
| `created` | string | ISO 8601 creation timestamp |

Setting `status` to `"archived"` stops the daemon from spawning new agents for this project.

## AGENTS.md

`AGENTS.md` is the system prompt given to every agent spawned for this project. It should contain project-specific instructions: code style, workflow rules, build commands, key files, and anything an agent needs to work autonomously.

Default template:

```markdown
# Agent Instructions — <project-name>

## Guidelines

- Work inside the `work/` directory
- Keep `docs/notes.md` updated with discoveries
- One task per session — complete it fully before stopping
- Commit changes with descriptive messages
```

When the daemon spawns an agent for a task, it reads `AGENTS.md` and uses it as the agent's system prompt (see `server.ts` `spawnProjectAgent`). This is the primary way to control agent behavior per-project.

## Task file format

Task files live in `tasks/` and use YAML frontmatter followed by a markdown body:

```markdown
---
id: 3
status: todo
created: 2026-03-28T21:15:00Z
agent: null
started: null
completed: null
---

# Implement user authentication

Add JWT-based auth to the API. Support login, logout, and token refresh.
Protect all endpoints except /health.
```

### Frontmatter fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Auto-incremented task ID |
| `status` | `todo` \| `in-progress` \| `done` \| `failed` | Current state |
| `created` | string | ISO 8601 creation timestamp |
| `agent` | string \| null | ID of the assigned agent (null when unassigned) |
| `started` | string \| null | Timestamp when work began |
| `completed` | string \| null | Timestamp when work finished |

### File naming

Task files follow the pattern `NNN-slug.md` where `NNN` is a zero-padded ID:

```
001-setup-project.md
002-implement-api.md
003-add-auth.md
```

Add tasks with the `projects` skill:

```
projects add-task my-api "Implement user authentication"
```

This creates the file and emits a `task-added` event that the daemon picks up on its next scan.

## Auto-trigger agent spawning

The daemon runs a task watcher that scans projects every 10 seconds:

1. **Scan** — iterates all project directories, reads each `config.json`
2. **Filter** — skips projects where `status !== "active"`
3. **Count** — counts `in-progress` tasks for the project
4. **Check capacity** — compares count against `maxAgents`
5. **Spawn** — if under the limit, picks the next `todo` task (by ID order) and calls `spawnProjectAgent()`

### What `spawnProjectAgent` does

1. Reads `AGENTS.md` as the system prompt
2. Updates the task frontmatter: `status: in-progress`, sets `started` timestamp
3. Determines the working directory (`work/` or a nested single directory within it)
4. Spawns a Claude agent via the Agent SDK with:
   - Tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Agent
   - Max 30 turns
   - The task description as the prompt
5. On completion: sets `status: done`, `completed` timestamp
6. On failure: sets `status: failed`, `completed` timestamp
7. Emits bus events throughout: `agent:spawned`, `agent:completed`, `agent:failed`

### Concurrency control

Agent spawning is routed through the lane queue system. Project agents use the `sub` lane (default max 6 concurrent). Each project's `maxAgents` is an additional per-project cap on top of the global lane limit.

The daemon tracks active project agents in an `activeProjectAgents` set to prevent duplicate spawns for the same task.

## Kanban board workflow

The web dashboard (`web/`) provides a kanban board for each project at the Projects page.

### Columns

| Column | Status | Indicator |
|--------|--------|-----------|
| Todo | `todo` | Gray dot |
| In Progress | `in-progress` | Accent dot |
| Done | `done` | Green dot |

Tasks move left-to-right as the daemon processes them:

```
Todo → In Progress → Done
                  ↘ Failed
```

### Task cards

Each card shows:
- Task title (from the `# heading` in the markdown body)
- Task description (body text)
- Assigned agent ID (if in-progress)
- Started timestamp (if applicable)

### API endpoints

The kanban board fetches data from these daemon endpoints:

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/api/projects` | GET | List of all projects with task counts |
| `/api/projects/:name` | GET | Project detail with full task list |
| `/api/projects/:name/tasks` | GET | Tasks for a specific project |

### Typical workflow

1. **Create a project** — `projects create <name> "<description>"` sets up the directory structure
2. **Write AGENTS.md** — define how agents should work in this project
3. **Add tasks** — `projects add-task <name> "<title>"` creates task files with `status: todo`
4. **Daemon picks up tasks** — the 10-second scan finds `todo` tasks and spawns agents
5. **Monitor on kanban** — watch tasks move from Todo → In Progress → Done in the web UI
6. **Review results** — check `work/` for agent output, `docs/notes.md` for discoveries
