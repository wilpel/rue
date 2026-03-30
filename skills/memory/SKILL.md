# memory

Store, search, and manage long-term memories. Two layers: MEMORY.md for durable facts, daily notes for running context.

## Usage

```bash
# Store a fact to long-term memory (MEMORY.md)
node --import tsx/esm skills/memory/run.ts remember --fact "User's name is William" --tags "user,identity"

# Add a daily note (today's running context)
node --import tsx/esm skills/memory/run.ts note --text "Discussed Telegram integration, user wants emoji reactions"

# Search memories by keyword/topic
node --import tsx/esm skills/memory/run.ts search --query "user preferences"

# Read MEMORY.md (all long-term facts)
node --import tsx/esm skills/memory/run.ts read

# Read today's notes
node --import tsx/esm skills/memory/run.ts today

# Read a specific day's notes
node --import tsx/esm skills/memory/run.ts day --date 2026-03-29

# Forget a specific fact
node --import tsx/esm skills/memory/run.ts forget --key "fact-key-here"

# List all fact keys
node --import tsx/esm skills/memory/run.ts list
```

## How memory works

**MEMORY.md** (`~/.rue/memory/MEMORY.md`):
Long-term durable facts. Things that should persist forever: user's name, preferences, project context, important decisions. Updated explicitly by you.

**Daily notes** (`~/.rue/memory/daily/YYYY-MM-DD.md`):
Running context for the day. Observations, conversation summaries, things worth remembering short-term. Today and yesterday's notes are loaded into your context automatically.

**Search**:
Searches both MEMORY.md and daily notes using keyword matching. Use when you need to recall something specific.

## When to use

**Store a memory when:**
- User tells you their name, preferences, or background
- An important decision is made about a project
- You learn something that future conversations should know
- User explicitly says "remember this"

**Add a daily note when:**
- A conversation covers something worth noting for context
- A task completes with notable results
- You discover something about the codebase or project

**Search when:**
- User references something from the past
- You need context about a project or decision
- Starting a new conversation and need background

**Don't overdo it** — not every message needs to be memorized. Store what matters.
