# Delegate Ask

Post a question or status update back to the orchestrator and wait for a response. Use this when you need clarification, user input, or a decision from the main agent before continuing.

## Usage

```bash
node --import tsx/esm skills/delegate-ask/run.ts \
  --agent-id "delegate-12345" \
  --question "Should I use the free or paid API for this search?"
```

### Arguments

- `--agent-id` (required) — Your delegate agent ID (passed to you in context)
- `--question` (required) — The question or status update to send back

The command blocks until the orchestrator responds, then prints the answer to stdout.
