# triggers

Create event-driven triggers: "when X happens, do Y". Watch for events and react automatically.

## Usage

```bash
# Create a trigger
node --import tsx/esm skills/triggers/run.ts create --name "notify on failure" --event "agent:failed" --action "Alert user that an agent failed"

# Create a trigger with a condition
node --import tsx/esm skills/triggers/run.ts create --name "watch pushes" --event "message:created" --condition '{"role":"push"}' --action "Process the push message"

# List all triggers
node --import tsx/esm skills/triggers/run.ts list

# Remove a trigger
node --import tsx/esm skills/triggers/run.ts remove --id <trigger_id>

# Enable/disable
node --import tsx/esm skills/triggers/run.ts toggle --id <trigger_id> --active false
```

## Events you can watch

- `agent:spawned` — an agent was created
- `agent:completed` — an agent finished successfully
- `agent:failed` — an agent errored
- `message:created` — any message was added to the store
- `task:completed` — a task DAG finished
- `system:started` — the daemon started
- `system:shutdown` — the daemon is shutting down

## Conditions

- `*` (default) — fire on any event of that type
- JSON partial match — e.g. `{"role":"push"}` only fires when the message role is "push"

## How it works

Triggers are stored in `~/.rue/triggers/triggers.sqlite`. The daemon watches the event bus and checks active triggers. When a trigger fires, it creates a push message in the message store that the agent can act on.

## When to use

When the user wants automated reactions: "when an agent fails, notify me", "when a push message arrives, process it", "if X happens, do Y".
