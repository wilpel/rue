#!/usr/bin/env tsx

/**
 * Knowledge Base skill — stores pages in Supabase kb_pages table via daemon API.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

function loadConfig(): { port: number } {
  const configPath = path.join(os.homedir(), ".rue", "config.json");
  if (fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return { port: raw.port ?? 18800 };
  }
  return { port: 18800 };
}

const config = loadConfig();
const BASE = `http://127.0.0.1:${config.port}/api`;

function getArg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

async function post(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return await res.json() as Record<string, unknown>;
}

const command = process.argv[2];

switch (command) {
  case "save": {
    const pagePath = getArg("path");
    const content = getArg("content");
    const tags = getArg("tags");

    if (!pagePath || !content) {
      console.error("Usage: kb save --path <page-path> --content \"...\" [--tags \"tag1,tag2\"]");
      process.exit(1);
    }

    const tagList = tags ? tags.split(",").map(t => t.trim()) : [];
    const data = await post(`${BASE}/memory/kb`, { path: pagePath, content, tags: tagList });
    if (data.ok) console.log(`Saved: ${pagePath}`);
    else console.error(`Failed: ${data.error}`);
    break;
  }

  case "search": {
    const query = getArg("query");
    if (!query) { console.error("Usage: kb search --query \"...\""); process.exit(1); }

    // Query kb_pages via db endpoint
    const data = await post(`${BASE}/db/query`, { table: "kb_pages", select: "path,title,content,tags" });
    const pages = (data.rows ?? []) as Array<{ path: string; title: string; content: string; tags: string[] }>;
    const terms = query.toLowerCase().split(/\s+/);

    const results = pages
      .map(p => {
        const lower = (p.content + " " + (p.tags ?? []).join(" ") + " " + p.title).toLowerCase();
        let score = 0;
        for (const t of terms) { score += (lower.split(t).length - 1); if (p.path.toLowerCase().includes(t)) score += 3; }
        return { ...p, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (results.length === 0) { console.log("No results found."); break; }
    for (const r of results) {
      console.log(`[${r.path}] ${r.title} (score: ${r.score})`);
      console.log(`  ${r.content.slice(0, 120).replace(/\n/g, " ")}`);
      console.log();
    }
    break;
  }

  case "read": {
    const pagePath = getArg("path");
    if (!pagePath) { console.error("Usage: kb read --path <page-path>"); process.exit(1); }

    const data = await post(`${BASE}/db/query`, { table: "kb_pages", select: "content,title,tags", limit: 1 });
    // Filter client-side since we can't easily filter via the generic query endpoint
    const pages = (data.rows ?? []) as Array<{ content: string; title: string }>;
    // Actually use a more targeted query
    const res = await fetch(`${BASE}/db/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "kb_pages", select: "content,title,tags", filters: { path: pagePath.toLowerCase().replace(/\s+/g, "-") } }),
    });
    const result = await res.json() as Record<string, unknown>;
    const rows = (result.rows ?? []) as Array<{ content: string; title: string; tags: string[] }>;
    if (rows.length === 0) { console.log(`Page not found: ${pagePath}`); break; }
    console.log(rows[0].content);
    break;
  }

  case "list": {
    const folder = getArg("folder");
    const data = await post(`${BASE}/db/query`, { table: "kb_pages", select: "path,title" });
    let pages = (data.rows ?? []) as Array<{ path: string; title: string }>;
    if (folder) pages = pages.filter(p => p.path.startsWith(folder));
    pages.sort((a, b) => a.path.localeCompare(b.path));

    if (pages.length === 0) {
      console.log(folder ? `No pages in ${folder}/` : "Knowledge base is empty.");
      break;
    }

    console.log(`${pages.length} page(s)${folder ? ` in ${folder}/` : ""}:\n`);
    const grouped = new Map<string, string[]>();
    for (const p of pages) {
      const parts = p.path.split("/");
      const dir = parts.length > 1 ? parts[0] : "(root)";
      if (!grouped.has(dir)) grouped.set(dir, []);
      grouped.get(dir)!.push(p.path);
    }
    for (const [dir, items] of grouped) {
      console.log(`${dir}/`);
      for (const item of items) console.log(`  ${item}`);
    }
    break;
  }

  default:
    console.log("Knowledge Base — Supabase-backed page store");
    console.log();
    console.log("Commands:");
    console.log("  save    --path <path> --content \"...\" [--tags \"t1,t2\"]");
    console.log("  search  --query \"...\"");
    console.log("  read    --path <path>");
    console.log("  list    [--folder <name>]");
}
