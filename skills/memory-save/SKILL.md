# Memory Save

Save information to Rue's long-term memory systems. Use this to persist important facts, people, preferences, and observations that should survive across conversations.

## Commands

### Save to Knowledge Base
```bash
node --import tsx/esm skills/memory-save/run.ts kb \
  --path "people/john" \
  --content "John is a colleague who works on the backend team." \
  --tags "colleague,work"
```

### Save a Fact
```bash
node --import tsx/esm skills/memory-save/run.ts fact \
  --key "project-deadline" \
  --content "The API rewrite is due April 15, 2026." \
  --tags "work,deadline"
```

### Update Agent Identity
```bash
node --import tsx/esm skills/memory-save/run.ts identity \
  --field "quirks" \
  --value '["likes puns", "prefers concise code"]'
```

Fields: name, personalityBase, communicationStyle, values, expertiseAreas, quirks

### Update User Profile
```bash
node --import tsx/esm skills/memory-save/run.ts user \
  --field "name" \
  --value "William"
```

Fields: name, expertise, preferences, workPatterns, currentProjects, communicationStyle

## When to Use

- Learned something about a person → `kb` (path: people/name)
- Learned a fact or decision → `fact`
- Learned something about yourself → `identity`
- Learned something about the user → `user`
