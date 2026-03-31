#!/usr/bin/env tsx
import { execSync } from "node:child_process";

// ── Helpers ────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function gh(cmd: string): string {
  try {
    return execSync(`gh ${cmd}`, { encoding: "utf-8", timeout: 30_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString().trim() ?? "";
    if (stderr.includes("gh auth login") || stderr.includes("not logged")) {
      console.error("Error: gh CLI is not authenticated. Run `gh auth login` first.");
    } else if (err.code === "ENOENT" || stderr.includes("command not found")) {
      console.error("Error: gh CLI is not installed. Install it from https://cli.github.com");
    } else {
      console.error(`Error: ${stderr || err.message}`);
    }
    process.exit(1);
  }
}

function parseJSON<T = any>(raw: string): T {
  try {
    return JSON.parse(raw);
  } catch {
    console.error("Error: Failed to parse JSON from gh output.");
    process.exit(1);
  }
}

function requireArg(name: string, usage: string): string {
  const val = getArg(name);
  if (!val) {
    console.error(`Missing required argument: --${name}`);
    console.error(`Usage: ${usage}`);
    process.exit(1);
  }
  return val;
}

// ── Formatters ─────────────────────────────────────────────

function fmtRepo(r: any): string {
  const stars = r.stargazerCount != null ? ` | ${r.stargazerCount} stars` : "";
  const lang = r.primaryLanguage?.name ? ` | ${r.primaryLanguage.name}` : "";
  const vis = r.visibility ? ` [${r.visibility}]` : "";
  const desc = r.description ? `\n    ${r.description}` : "";
  return `  ${r.nameWithOwner || r.fullName || r.name}${vis}${lang}${stars}${desc}`;
}

function fmtPR(p: any): string {
  const labels = p.labels?.length ? ` (${p.labels.map((l: any) => l.name).join(", ")})` : "";
  return `  #${p.number} [${p.state}] ${p.title}${labels}\n    by ${p.author?.login ?? "unknown"} | ${p.createdAt ?? ""}`;
}

function fmtIssue(i: any): string {
  const labels = i.labels?.length ? ` (${i.labels.map((l: any) => l.name).join(", ")})` : "";
  return `  #${i.number} [${i.state}] ${i.title}${labels}\n    by ${i.author?.login ?? "unknown"} | ${i.createdAt ?? ""}`;
}

// ── Commands ───────────────────────────────────────────────

switch (command) {
  case "repos": {
    const org = getArg("org");
    const limit = getArg("limit") ?? "10";
    const target = org ? `orgs/${org}` : "user";
    const repoList = gh(`api "${target}/repos?per_page=${limit}&sort=updated"`);
    const repos = parseJSON<any[]>(repoList);
    if (repos.length === 0) {
      console.log("No repos found.");
    } else {
      console.log(`Repos${org ? ` for ${org}` : ""}:\n`);
      for (const r of repos.slice(0, parseInt(limit))) {
        const stars = r.stargazers_count != null ? ` | ${r.stargazers_count} stars` : "";
        const lang = r.language ? ` | ${r.language}` : "";
        const vis = r.visibility ? ` [${r.visibility}]` : "";
        const desc = r.description ? `\n    ${r.description}` : "";
        console.log(`  ${r.full_name}${vis}${lang}${stars}${desc}`);
      }
    }
    break;
  }

  case "repo": {
    const repo = requireArg("repo", "run.ts repo --repo <owner/name>");
    const raw = gh(`repo view ${repo} --json name,nameWithOwner,description,visibility,stargazerCount,forkCount,primaryLanguage,defaultBranchRef,createdAt,updatedAt,homepageUrl,url,isArchived,isFork,issues,pullRequests`);
    const r = parseJSON(raw);
    console.log(`Repository: ${r.nameWithOwner}`);
    console.log(`  URL: ${r.url}`);
    if (r.description) console.log(`  Description: ${r.description}`);
    console.log(`  Visibility: ${r.visibility}`);
    if (r.primaryLanguage?.name) console.log(`  Language: ${r.primaryLanguage.name}`);
    console.log(`  Stars: ${r.stargazerCount ?? 0} | Forks: ${r.forkCount ?? 0}`);
    console.log(`  Default branch: ${r.defaultBranchRef?.name ?? "unknown"}`);
    if (r.homepageUrl) console.log(`  Homepage: ${r.homepageUrl}`);
    console.log(`  Created: ${r.createdAt} | Updated: ${r.updatedAt}`);
    if (r.isArchived) console.log(`  ARCHIVED`);
    if (r.isFork) console.log(`  (fork)`);
    if (r.issues?.totalCount != null) console.log(`  Open issues: ${r.issues.totalCount}`);
    if (r.pullRequests?.totalCount != null) console.log(`  Open PRs: ${r.pullRequests.totalCount}`);
    break;
  }

  case "prs": {
    const repo = requireArg("repo", "run.ts prs --repo <owner/name> [--state <open|closed|merged|all>] [--limit <n>]");
    const state = getArg("state") ?? "open";
    const limit = getArg("limit") ?? "10";
    const raw = gh(`pr list --repo ${repo} --state ${state} --limit ${limit} --json number,title,state,author,createdAt,labels,headRefName,baseRefName,isDraft`);
    const prs = parseJSON<any[]>(raw);
    if (prs.length === 0) {
      console.log(`No ${state} PRs found in ${repo}.`);
    } else {
      console.log(`Pull requests in ${repo} (${state}):\n`);
      for (const p of prs) {
        const draft = p.isDraft ? " [DRAFT]" : "";
        const labels = p.labels?.length ? ` (${p.labels.map((l: any) => l.name).join(", ")})` : "";
        console.log(`  #${p.number} [${p.state}]${draft} ${p.title}${labels}`);
        console.log(`    ${p.headRefName} -> ${p.baseRefName} | by ${p.author?.login ?? "unknown"} | ${p.createdAt}`);
      }
    }
    break;
  }

  case "pr": {
    const repo = requireArg("repo", "run.ts pr --repo <owner/name> --number <n>");
    const number = requireArg("number", "run.ts pr --repo <owner/name> --number <n>");
    const raw = gh(`pr view ${number} --repo ${repo} --json number,title,state,author,createdAt,updatedAt,body,labels,headRefName,baseRefName,isDraft,mergeable,additions,deletions,changedFiles,reviewDecision,reviews,comments,url`);
    const p = parseJSON(raw);
    console.log(`PR #${p.number}: ${p.title}`);
    console.log(`  URL: ${p.url}`);
    console.log(`  State: ${p.state}${p.isDraft ? " (draft)" : ""}`);
    console.log(`  Author: ${p.author?.login ?? "unknown"}`);
    console.log(`  Branch: ${p.headRefName} -> ${p.baseRefName}`);
    if (p.labels?.length) console.log(`  Labels: ${p.labels.map((l: any) => l.name).join(", ")}`);
    if (p.reviewDecision) console.log(`  Review: ${p.reviewDecision}`);
    console.log(`  Changes: +${p.additions ?? 0} -${p.deletions ?? 0} (${p.changedFiles ?? 0} files)`);
    console.log(`  Created: ${p.createdAt} | Updated: ${p.updatedAt}`);
    if (p.body) {
      console.log(`\n  Description:\n    ${p.body.split("\n").join("\n    ")}`);
    }
    if (p.reviews?.length) {
      console.log(`\n  Reviews:`);
      for (const r of p.reviews) {
        console.log(`    ${r.author?.login ?? "unknown"}: ${r.state}`);
      }
    }
    if (p.comments?.length) {
      console.log(`\n  Comments (${p.comments.length}):`);
      for (const c of p.comments.slice(0, 5)) {
        const body = c.body?.split("\n")[0] ?? "";
        console.log(`    ${c.author?.login ?? "unknown"}: ${body}`);
      }
      if (p.comments.length > 5) console.log(`    ... and ${p.comments.length - 5} more`);
    }
    break;
  }

  case "issues": {
    const repo = requireArg("repo", "run.ts issues --repo <owner/name> [--state <open|closed|all>] [--limit <n>]");
    const state = getArg("state") ?? "open";
    const limit = getArg("limit") ?? "10";
    const raw = gh(`issue list --repo ${repo} --state ${state} --limit ${limit} --json number,title,state,author,createdAt,labels,assignees`);
    const issues = parseJSON<any[]>(raw);
    if (issues.length === 0) {
      console.log(`No ${state} issues found in ${repo}.`);
    } else {
      console.log(`Issues in ${repo} (${state}):\n`);
      for (const i of issues) {
        const labels = i.labels?.length ? ` (${i.labels.map((l: any) => l.name).join(", ")})` : "";
        const assignees = i.assignees?.length ? ` -> ${i.assignees.map((a: any) => a.login).join(", ")}` : "";
        console.log(`  #${i.number} [${i.state}] ${i.title}${labels}${assignees}`);
        console.log(`    by ${i.author?.login ?? "unknown"} | ${i.createdAt}`);
      }
    }
    break;
  }

  case "issue": {
    const repo = requireArg("repo", "run.ts issue --repo <owner/name> --number <n>");
    const number = requireArg("number", "run.ts issue --repo <owner/name> --number <n>");
    const raw = gh(`issue view ${number} --repo ${repo} --json number,title,state,author,createdAt,updatedAt,body,labels,assignees,comments,url`);
    const i = parseJSON(raw);
    console.log(`Issue #${i.number}: ${i.title}`);
    console.log(`  URL: ${i.url}`);
    console.log(`  State: ${i.state}`);
    console.log(`  Author: ${i.author?.login ?? "unknown"}`);
    if (i.labels?.length) console.log(`  Labels: ${i.labels.map((l: any) => l.name).join(", ")}`);
    if (i.assignees?.length) console.log(`  Assignees: ${i.assignees.map((a: any) => a.login).join(", ")}`);
    console.log(`  Created: ${i.createdAt} | Updated: ${i.updatedAt}`);
    if (i.body) {
      console.log(`\n  Description:\n    ${i.body.split("\n").join("\n    ")}`);
    }
    if (i.comments?.length) {
      console.log(`\n  Comments (${i.comments.length}):`);
      for (const c of i.comments.slice(0, 5)) {
        const body = c.body?.split("\n")[0] ?? "";
        console.log(`    ${c.author?.login ?? "unknown"}: ${body}`);
      }
      if (i.comments.length > 5) console.log(`    ... and ${i.comments.length - 5} more`);
    }
    break;
  }

  case "orgs": {
    const raw = gh(`api user/orgs --jq '.[].login'`);
    if (!raw) {
      console.log("No organizations found.");
    } else {
      const orgs = raw.split("\n").filter(Boolean);
      console.log(`Organizations (${orgs.length}):\n`);
      for (const org of orgs) {
        console.log(`  ${org}`);
      }
    }
    break;
  }

  case "notifications": {
    const limit = parseInt(getArg("limit") ?? "10");
    const raw = gh(`api notifications?per_page=${limit}`);
    const notifs = parseJSON<any[]>(raw);
    if (notifs.length === 0) {
      console.log("No unread notifications.");
    } else {
      console.log(`Unread notifications (${notifs.length}):\n`);
      for (const n of notifs) {
        const repo = n.repository?.full_name ?? "unknown";
        const reason = n.reason ?? "";
        console.log(`  [${n.subject?.type ?? "?"}] ${n.subject?.title ?? "untitled"}`);
        console.log(`    repo: ${repo} | reason: ${reason} | ${n.updated_at ?? ""}`);
      }
    }
    break;
  }

  case "search": {
    const type = requireArg("type", "run.ts search --type <repos|issues|prs> --query <search string> [--limit <n>]");
    const query = requireArg("query", "run.ts search --type <repos|issues|prs> --query <search string> [--limit <n>]");
    const limit = getArg("limit") ?? "10";

    if (type === "repos") {
      const raw = gh(`search repos "${query}" --limit ${limit} --json fullName,description,stargazersCount,language,visibility,updatedAt`);
      const repos = parseJSON<any[]>(raw);
      if (repos.length === 0) {
        console.log("No repos found.");
      } else {
        console.log(`Search results for repos matching "${query}":\n`);
        for (const r of repos) {
          const stars = r.stargazersCount != null ? ` | ${r.stargazersCount} stars` : "";
          const lang = r.language ? ` | ${r.language}` : "";
          const desc = r.description ? `\n    ${r.description}` : "";
          console.log(`  ${r.fullName}${lang}${stars}${desc}`);
        }
      }
    } else if (type === "issues") {
      const raw = gh(`search issues "${query}" --limit ${limit} --json repository,number,title,state,author,createdAt,labels`);
      const issues = parseJSON<any[]>(raw);
      if (issues.length === 0) {
        console.log("No issues found.");
      } else {
        console.log(`Search results for issues matching "${query}":\n`);
        for (const i of issues) {
          const repo = i.repository?.nameWithOwner ?? "";
          const labels = i.labels?.length ? ` (${i.labels.map((l: any) => l.name).join(", ")})` : "";
          console.log(`  ${repo}#${i.number} [${i.state}] ${i.title}${labels}`);
        }
      }
    } else if (type === "prs") {
      const raw = gh(`search prs "${query}" --limit ${limit} --json repository,number,title,state,author,createdAt,labels`);
      const prs = parseJSON<any[]>(raw);
      if (prs.length === 0) {
        console.log("No PRs found.");
      } else {
        console.log(`Search results for PRs matching "${query}":\n`);
        for (const p of prs) {
          const repo = p.repository?.nameWithOwner ?? "";
          const labels = p.labels?.length ? ` (${p.labels.map((l: any) => l.name).join(", ")})` : "";
          console.log(`  ${repo}#${p.number} [${p.state}] ${p.title}${labels}`);
        }
      }
    } else {
      console.error(`Unknown search type: ${type}. Use repos, issues, or prs.`);
      process.exit(1);
    }
    break;
  }

  default:
    console.log("Usage: run.ts <command> [options]");
    console.log("\nCommands:");
    console.log("  repos           List repos [--org <name>] [--limit <n>]");
    console.log("  repo            Get repo details --repo <owner/name>");
    console.log("  prs             List PRs --repo <owner/name> [--state <open|closed|merged|all>] [--limit <n>]");
    console.log("  pr              Get PR details --repo <owner/name> --number <n>");
    console.log("  issues          List issues --repo <owner/name> [--state <open|closed|all>] [--limit <n>]");
    console.log("  issue           Get issue details --repo <owner/name> --number <n>");
    console.log("  orgs            List your organizations");
    console.log("  notifications   List unread notifications [--limit <n>]");
    console.log("  search          Search GitHub --type <repos|issues|prs> --query <text> [--limit <n>]");
}
