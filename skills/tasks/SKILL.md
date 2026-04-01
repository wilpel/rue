# Tasks

Create, list, update, and complete tasks. Tasks can be work items, scheduled jobs, or reminders.

## Usage

```bash
# Create a task
node --import tsx/esm skills/tasks/run.ts create --title "Research AI agents" --type work --priority high

# Create a scheduled task
node --import tsx/esm skills/tasks/run.ts create --title "Check server health" --type scheduled --due "in 30m"

# Create a reminder
node --import tsx/esm skills/tasks/run.ts create --title "Review PR" --type reminder --due "in 2h"

# List all active tasks
node --import tsx/esm skills/tasks/run.ts list

# List by status
node --import tsx/esm skills/tasks/run.ts list --status completed

# Update a task
node --import tsx/esm skills/tasks/run.ts update --id task_abc123 --status active

# Complete a task
node --import tsx/esm skills/tasks/run.ts complete --id task_abc123

# Delete a task
node --import tsx/esm skills/tasks/run.ts delete --id task_abc123
```

## When to use

- Track work items that need to be done
- Set reminders for future actions
- Schedule recurring tasks
- Manage multi-step projects by breaking them into tasks

## Task types

- **work** — something that needs to be done (default)
- **scheduled** — runs at a specific time or interval
- **reminder** — notifies at a specific time

## Priority levels

- **low**, **normal** (default), **high**, **urgent**
