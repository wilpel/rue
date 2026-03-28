# projects

Manage projects — organized workspaces with task boards, agent instructions, and documentation. Projects let Rue delegate sustained work to autonomous agents.

## Usage

```bash
# Create a new project
node --import tsx/esm skills/projects/run.ts create --name "my-api" --description "REST API for task management" --max-agents 2

# Create from a git repo (clones into work/)
node --import tsx/esm skills/projects/run.ts create --name "my-api" --git "https://github.com/user/repo.git"

# List all projects
node --import tsx/esm skills/projects/run.ts list

# Show project details (config, tasks, active agents)
node --import tsx/esm skills/projects/run.ts status --project "my-api"

# Add a task (creates task file, emits trigger event for agent spawning)
node --import tsx/esm skills/projects/run.ts add-task --project "my-api" --task "Set up Express with TypeScript"

# Update task status
node --import tsx/esm skills/projects/run.ts update-task --project "my-api" --task 1 --status in-progress --agent agent_abc
node --import tsx/esm skills/projects/run.ts update-task --project "my-api" --task 1 --status done

# Archive a project
node --import tsx/esm skills/projects/run.ts archive --project "my-api"
```

## Project structure

Each project lives at `~/.rue/workspace/projects/<name>/`:
- `PROJECT.md` — What this project is, goals, context. You write this after creating.
- `AGENTS.md` — Instructions for agents working on this project. You write this after creating.
- `config.json` — Metadata (name, description, maxAgents, status, tags)
- `docs/` — Project knowledge. Keep docs/notes.md updated with discoveries.
- `tasks/` — One file per task (e.g. `001-setup-express.md`) with YAML frontmatter
- `work/` — All working files (cloned repos, generated code). Agents operate here.

## Task file format

```markdown
---
id: 1
status: todo
created: 2026-03-28T21:10:00Z
agent: null
started: null
completed: null
---

# Task title

Task description here.
```

Status: `todo` → `in-progress` → `done` | `failed`

## When to use

- User asks for sustained work: "build me an API", "research X", "set up deployment"
- Work has multiple steps or spans multiple interactions
- Do NOT create projects for quick questions or single-shot tasks

## After creating a project

1. Write meaningful content into PROJECT.md (goals, context, approach)
2. Write AGENTS.md with project-specific agent instructions (code style, rules, workflow)
3. Add tasks with add-task — each task auto-triggers an agent
