# github

Manage GitHub repos, orgs, PRs, issues, notifications, and search using the `gh` CLI.

## Usage

```bash
# List your repos (or an org's repos)
node --import tsx/esm skills/github/run.ts repos [--org <name>] [--limit <n>]

# Get details about a specific repo
node --import tsx/esm skills/github/run.ts repo --repo <owner/name>

# List pull requests
node --import tsx/esm skills/github/run.ts prs --repo <owner/name> [--state <open|closed|merged|all>] [--limit <n>]

# Get details about a specific PR
node --import tsx/esm skills/github/run.ts pr --repo <owner/name> --number <n>

# List issues
node --import tsx/esm skills/github/run.ts issues --repo <owner/name> [--state <open|closed|all>] [--limit <n>]

# Get details about a specific issue
node --import tsx/esm skills/github/run.ts issue --repo <owner/name> --number <n>

# List orgs the authenticated user belongs to
node --import tsx/esm skills/github/run.ts orgs

# List unread notifications
node --import tsx/esm skills/github/run.ts notifications [--limit <n>]

# Search repos, issues, or PRs
node --import tsx/esm skills/github/run.ts search --type <repos|issues|prs> --query <search string> [--limit <n>]
```

## Prerequisites

- The `gh` CLI must be installed and authenticated (`gh auth login`)
- JSON output is used wherever possible for structured data

## When to use

- When the user asks about their GitHub repos, PRs, issues, or notifications
- When you need to look up details about a specific repo, PR, or issue
- When searching GitHub for repos, issues, or pull requests
- When checking what orgs the user belongs to
