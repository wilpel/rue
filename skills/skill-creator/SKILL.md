# Skill Creator

Create new skills from a description. Spawns a background agent that builds the complete skill with SKILL.md, run.ts, and metadata.json — following Rue's skill conventions.

## Usage

```bash
node --import tsx/esm skills/skill-creator/run.ts create \
  --name "my-skill" \
  --description "Detailed description of what the skill should do, what commands it needs, what data it manages..."
```

## When to use

- User asks for a new capability that doesn't exist as a skill yet
- A reusable tool is needed (not a one-off task)
- The capability involves CRUD operations, external APIs, or data management

## How it works

1. The skill posts a creation request to the daemon's delegate API
2. A background agent receives the full description plus Rue's skill-creation guide
3. The agent creates the skill directory with all required files
4. The skill is available to all agents immediately (no restart needed)

## Important

The creator builds GENERAL-PURPOSE skills. If asked to "query a database", it creates a full database skill with connect, query, list-tables, describe — not just one query wrapper. Skills should be reusable tools, not single-use scripts.
