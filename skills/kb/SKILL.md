# Knowledge Base

Obsidian-style structured knowledge base. Stores everything important about the user, their life, work, projects, people, and preferences as interlinked markdown files.

## Storage

All knowledge lives in `~/.rue/kb/` as markdown files organized into folders:
- `people/` — People the user knows, colleagues, friends, family
- `work/` — Companies, roles, projects at work
- `projects/` — Personal and side projects
- `life/` — Preferences, routines, locations, life events
- `topics/` — Technical topics, research, interests
- `daily/` — Daily observations and running context

Each file uses YAML frontmatter + markdown body with `[[wikilinks]]` to connect pages.

## Commands

### save — Create or update a knowledge page

```bash
node --import tsx/esm skills/kb/run.ts save \
  --path "people/elin" \
  --tags "family,partner" \
  --content "William's partner. They live together in Stockholm and are looking for a bigger apartment (3+ rooms)."
```

If the page exists, appends to it. If not, creates it with frontmatter.

### search — Find pages by keyword

```bash
node --import tsx/esm skills/kb/run.ts search --query "apartment stockholm"
```

Returns matching pages with snippets.

### read — Read a specific page

```bash
node --import tsx/esm skills/kb/run.ts read --path "people/elin"
```

### list — List all pages or pages in a folder

```bash
node --import tsx/esm skills/kb/run.ts list
node --import tsx/esm skills/kb/run.ts list --folder people
```

### link — Add a link between two pages

```bash
node --import tsx/esm skills/kb/run.ts link --from "people/william" --to "work/playground-dev"
```

## When to use

**PROACTIVELY store knowledge whenever you learn something about the user:**
- User mentions a person → create/update page in people/
- User mentions their work, company, role → create/update in work/
- User talks about a project → create/update in projects/
- User shares preferences, routines, locations → create/update in life/
- User asks about a topic repeatedly → create page in topics/

**Search before answering when:**
- User references a person, project, or topic you may have notes on
- User asks "do you remember..." or references past conversations
- You need context about the user's life/work to give a good answer

## File format

```markdown
---
title: Elin
tags: [family, partner]
created: 2026-03-30
updated: 2026-03-30
links: [people/william, life/apartment-search]
---

# Elin

William's partner. They live together in Stockholm.

## Notes

- Looking for a bigger apartment together (3+ rooms, family-friendly areas)
- Prefers Södermalm, Vasastan, Kungsholmen
```
