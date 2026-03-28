# Projects System — Design Specification

A filesystem-based project management system implemented as a Rue skill. Projects organize sustained work into managed workspaces with task boards, agent instructions, and documentation — all driven by event-triggered autonomous agents.

## Goals

- Rue autonomously creates projects when users request sustained work
- Each project is a self-contained workspace with metadata, tasks, docs, and working files
- Tasks auto-trigger agent spawning via the existing trigger system
- Agents work autonomously with project-specific instructions (AGENTS.md)
- One task file per task — agents don't conflict
- Configurable concurrency per project

## Non-Goals

- UI for project management (TUI board view is future work)
- Cross-project dependencies
- Project templates

---

## Project Directory Structure

```
~/.rue/workspace/projects/<project-name>/
├── PROJECT.md          # What this project is, goals, status, context
├── AGENTS.md           # Instructions for agents working on this project
├── config.json         # Project metadata
├── docs/               # Project knowledge — Rue keeps updated
│   └── notes.md        # Discoveries, decisions, context
├── tasks/              # One file per task
│   ├── 001-setup-express.md
│   ├── 002-add-authentication.md
│   └── 003-database-schema.md
└── work/               # All working files (cloned repos, generated code)
    └── <repo>/
```

The `work/` directory isolates working files from project metadata. Agents operate inside `work/`. Everything outside `work/` is Rue's project management layer.

### config.json

```json
{
  "name": "my-api",
  "created": "2026-03-28T21:00:00Z",
  "description": "REST API for task management",
  "maxAgents": 2,
  "status": "active",
  "tags": ["coding", "api"]
}
```

### Task File Format

Each task is `tasks/NNN-slug.md` with YAML frontmatter:

```markdown
---
id: 1
status: todo
created: 2026-03-28T21:10:00Z
agent: null
started: null
completed: null
---

# Set up Express project with TypeScript

Initialize the project with Express, TypeScript strict mode, and a basic health check endpoint.
```

Status values: `todo` → `in-progress` → `done` | `failed`

When an agent picks up a task, it updates the frontmatter (`status: in-progress`, `agent: <id>`, `started: <timestamp>`). On completion: `status: done`, `completed: <timestamp>`. The agent can append notes to the task body.

### AGENTS.md

Written by Rue when creating the project. Contains project-specific instructions for agents:

```markdown
# Agent Instructions

You are working on the my-api project — a REST API built with Express and TypeScript.

## Rules
- Write TypeScript, strict mode
- All endpoints need tests
- Use Prisma for database access
- Run tests before marking a task done
- Commit after each completed task

## Working directory
All code lives in work/. Do not modify files outside work/.

## When you pick up a task
1. Update the task file frontmatter: status to in-progress, add your agent ID
2. Do the work in work/
3. Run tests
4. Update the task file: status to done, add completed timestamp
5. Update docs/notes.md if you learned something relevant
```

### PROJECT.md

Written by Rue. Describes the project goals, current status, and relevant context. Rue updates this as the project evolves.

---

## Skill CLI

Located at `skills/projects/` with `SKILL.md` + `run.ts`.

### Commands

```bash
# Create a new project (scaffolds all files)
run.ts create --name "my-api" --description "REST API for tasks" --max-agents 2

# Create from git repo (clones into work/)
run.ts create --name "my-api" --git "https://github.com/user/repo.git"

# List all projects
run.ts list

# Show project status (config + task summary + active agents)
run.ts status --project "my-api"

# Add a task (creates task file, emits trigger event)
run.ts add-task --project "my-api" --task "Set up Express with TypeScript"

# Update task status
run.ts update-task --project "my-api" --task 1 --status in-progress --agent agent_abc

# Complete a task
run.ts update-task --project "my-api" --task 1 --status done

# Archive a project (sets status to archived)
run.ts archive --project "my-api"
```

### What `create` scaffolds

1. Creates `~/.rue/workspace/projects/<name>/` directory structure
2. Creates `config.json` with metadata
3. Creates empty `PROJECT.md` with placeholder (Rue fills in meaningful content after)
4. Creates empty `AGENTS.md` with placeholder (Rue fills in project-specific agent instructions after)
5. Creates `docs/notes.md` (empty)
6. Creates `tasks/` directory (empty)
7. Creates `work/` directory
8. If `--git` provided, clones the repo into `work/`

After the CLI scaffolds, Rue writes meaningful content into PROJECT.md and AGENTS.md based on the project context. The CLI creates the structure; Rue provides the intelligence.

### What `add-task` does

1. Determines next task number (reads existing files in `tasks/`)
2. Creates `tasks/NNN-slug.md` with frontmatter (status: todo) and task description
3. Writes trigger event to `~/.rue/workspace/events/task-added.json`:
   ```json
   {
     "project": "my-api",
     "taskFile": "tasks/001-setup-express.md",
     "task": "Set up Express with TypeScript",
     "timestamp": 1711659600000
   }
   ```

---

## Agent Spawning Flow

Event-driven via the existing trigger system:

```
add-task creates task file
  │
  ├── Writes trigger event file
  │
  ▼
Trigger fires: "task added to <project>"
  │
  ▼
Agent spawned:
  - System prompt: contents of AGENTS.md
  - User prompt: contents of the task file
  - cwd: ~/.rue/workspace/projects/<name>/work/
  - The agent updates the task file as it works
```

### Concurrency control

Before spawning, check how many task files have `status: in-progress` for the project. If count >= `config.json.maxAgents`, the task stays as `todo` and will be picked up when a current agent finishes.

The trigger that fires on task completion should re-check for pending todo tasks and spawn if capacity is available.

---

## Rue's Decision Logic (SYSTEM.md)

Rue decides when to create a project vs answer directly:

**Create a project when:**
- User asks for sustained work: "build me an API", "research X", "set up deployment"
- Work has multiple steps or spans multiple interactions
- Benefits from organized tasks, documentation, agent delegation

**Don't create a project for:**
- Quick questions: "what files are here?", "explain this code"
- Single-shot tasks: "rename this variable", "fix this typo"
- Conversation: "what's your name?", "how does X work?"

**Workflow:**
1. Check existing projects: `run.ts list`
2. If a project fits, add a task to it
3. If not, create a new project, write PROJECT.md and AGENTS.md, add tasks
4. Tasks auto-trigger agents — Rue manages, agents execute

---

## Implementation as a Skill

The entire system is a single skill at `skills/projects/`:
- `SKILL.md` — documents all commands and when to use them
- `run.ts` — standalone CLI tool, reads/writes the filesystem

No changes to Rue's core TypeScript daemon code. Uses the existing trigger skill for event-driven agent spawning. Uses the existing Agent tool for spawning.

The `~/.rue/workspace/` directory is created on first use. The `events/` subdirectory holds trigger event files.
