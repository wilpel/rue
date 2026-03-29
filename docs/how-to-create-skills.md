# How to Create Skills

Skills are Rue's modular capabilities — standalone CLI tools that any agent can discover and use.

## Structure

Every skill lives in `skills/<name>/` with two files:

```
skills/my-skill/
├── SKILL.md    # Documentation — what it does, how to use it, when to use it
└── run.ts      # CLI tool — standalone TypeScript script
```

## SKILL.md Template

```markdown
# my-skill

One-line description of what this skill does.

## Usage

\```bash
# Command examples with all options
node --import tsx/esm skills/my-skill/run.ts <command> [options]

# Example: create something
node --import tsx/esm skills/my-skill/run.ts create --name "example" --option "value"

# Example: list things
node --import tsx/esm skills/my-skill/run.ts list
\```

## When to use

- Describe scenarios when this skill should be used
- Be specific so agents can match tasks to skills

## Requirements

- List any prerequisites (API keys, installed tools, etc.)
```

## run.ts Template

```typescript
#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Data directory for this skill (persistent storage)
const DATA_DIR = path.join(os.homedir(), ".rue", "my-skill");
fs.mkdirSync(DATA_DIR, { recursive: true });

// Parse CLI arguments
const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

switch (command) {
  case "create": {
    const name = getArg("name");
    if (!name) {
      console.error("Usage: run.ts create --name <name>");
      process.exit(1);
    }
    // ... implement
    console.log(`Created: ${name}`);
    break;
  }

  case "list": {
    // ... implement
    console.log("Items:");
    break;
  }

  default:
    console.log("Usage: run.ts <create|list> [options]");
}
```

## Key Rules

1. **Self-contained** — skills must not import from Rue's `src/`. They are standalone scripts.
2. **No framework deps** — use Node.js built-ins and npm packages already in the project (better-sqlite3, etc). Avoid adding new deps.
3. **Store data in `~/.rue/`** — use `path.join(os.homedir(), ".rue", "<skill-name>")` for persistent data.
4. **CLI interface** — all interaction through `process.argv`. Use `getArg()` helper pattern.
5. **Print clear output** — success messages, error messages, help text. Agents read stdout.
6. **SKILL.md is critical** — agents discover skills by reading SKILL.md. If the docs are bad, the skill won't be used correctly.

## Argument Parsing Pattern

All skills use the same pattern for consistency:

```typescript
const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}
```

## Using SQLite for Storage

If you need structured data, use better-sqlite3 (already installed):

```typescript
import Database from "better-sqlite3";

const db = new Database(path.join(DATA_DIR, "data.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS items (...)`);
```

## Using the Filesystem for Storage

For simple data, use JSON files:

```typescript
const configPath = path.join(DATA_DIR, "config.json");

function load() {
  if (!fs.existsSync(configPath)) return { items: [] };
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

function save(data: unknown) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}
```

## Emitting Events

If your skill should trigger other actions (like agent spawning), write an event file:

```typescript
const eventsDir = path.join(os.homedir(), ".rue", "workspace", "events");
fs.mkdirSync(eventsDir, { recursive: true });
fs.writeFileSync(
  path.join(eventsDir, "my-event.json"),
  JSON.stringify({ type: "my-event", data: "...", timestamp: new Date().toISOString() })
);
```

## Existing Skills for Reference

Look at these for patterns:
- `skills/schedule/` — SQLite storage, CRUD commands, time parsing
- `skills/projects/` — filesystem-based project management, task files with frontmatter
- `skills/telegram/` — external API integration (Telegram Bot API)
- `skills/triggers/` — event-driven automation with SQLite
- `skills/list-skills/` — simplest skill, reads the skills directory

## Testing

Run your skill manually to verify:

```bash
cd /path/to/rue-bot
node --import tsx/esm skills/my-skill/run.ts create --name "test"
node --import tsx/esm skills/my-skill/run.ts list
```

The skill is available to agents immediately after creation — no restart needed.
