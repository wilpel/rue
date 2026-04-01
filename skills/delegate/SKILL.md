# Delegate

Spawn a background Claude agent to handle work asynchronously. The result is automatically sent back to the user via Telegram when done.

## When to use

Use this for ANY task that requires tool use — web searches, file reading, code analysis, research, multi-step operations. The main agent should acknowledge the user immediately, delegate the work, and move on.

## Usage

```bash
node --import tsx/esm skills/delegate/run.ts spawn \
  --task "Search the web for ..." \
  --name "Web researcher" \
  --chat-id 12345 \
  --message-id 67890
```

### Arguments

- `--task` (required) — Full description of what the background agent should do. Be specific.
- `--name` (optional) — Short display name for this agent (e.g., "Web researcher", "Code analyzer"). Shown in the UI.
- `--chat-id` (optional) — Telegram chat ID to send the result to. Omit for CLI — result is delivered back automatically.
- `--message-id` (optional) — Message ID to reply to.

### Check status of delegate agents

```bash
node --import tsx/esm skills/delegate/run.ts status
node --import tsx/esm skills/delegate/run.ts status --id delegate-1234567890
```

Shows all running/completed/failed delegate agents, how long they've been running, and result previews.

### How it works

1. The skill POSTs to the daemon's `/api/delegate` endpoint
2. The daemon spawns a background Claude process with full tool access
3. The background agent does the work (searches, reads files, etc.)
4. When done, the daemon sends the result back via Telegram automatically

### Example flow

User asks: "Research X for me"
1. Main agent responds: "Looking into that."
2. Main agent runs: `skills/delegate/run.ts spawn --task "Research X thoroughly..." --name "Research agent" --chat-id 123 --message-id 456`
3. Main agent is free for next messages
4. Background agent finishes → result sent to Telegram automatically
