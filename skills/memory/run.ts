#!/usr/bin/env tsx
/**
 * Memory skill — store/search facts and daily notes via Rue daemon API (Supabase-backed).
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

async function post(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return await res.json() as Record<string, unknown>;
}

async function get(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  return await res.json() as Record<string, unknown>;
}

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

switch (command) {
  case "remember": {
    const fact = getArg("fact");
    const tags = getArg("tags") ?? "";
    if (!fact) { console.error("Usage: memory remember --fact <text> [--tags <comma,separated>]"); process.exit(1); }
    const tagArr = tags ? tags.split(",").map(t => t.trim()) : [];
    const key = `fact-${Date.now().toString(36)}`;
    const data = await post(`${BASE}/memory/fact`, { key, content: fact, tags: tagArr });
    if (data.ok) {
      console.log(`Remembered: ${fact}`);
      console.log(`  Key: ${key}`);
      if (tagArr.length) console.log(`  Tags: ${tagArr.join(", ")}`);
    } else {
      console.error(`Failed: ${data.error}`);
    }
    break;
  }

  case "note": {
    const text = getArg("text");
    if (!text) { console.error("Usage: memory note --text <text>"); process.exit(1); }
    const today = new Date().toISOString().split("T")[0];
    const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const data = await post(`${BASE}/memory/kb`, {
      path: `daily/${today}`,
      content: `- **${time}** ${text}`,
      tags: ["daily", "note"],
    });
    if (data.ok) console.log(`Note added to daily/${today}`);
    else console.error(`Failed: ${data.error}`);
    break;
  }

  case "search": {
    const query = getArg("query");
    if (!query) { console.error("Usage: memory search --query <text>"); process.exit(1); }
    // Search via the daemon API — query the DB endpoint
    const data = await post(`${BASE}/db/query`, { table: "facts", select: "key,content,tags", limit: 20 });
    const rows = (data.rows ?? []) as Array<{ key: string; content: string; tags: string[] }>;
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const results = rows
      .map(r => {
        const lower = r.content.toLowerCase() + " " + (r.tags ?? []).join(" ").toLowerCase();
        let score = 0;
        for (const w of words) { if (lower.includes(w)) score++; }
        return { ...r, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (results.length === 0) { console.log("No results found."); break; }
    console.log(`${results.length} result(s):\n`);
    for (const r of results) {
      console.log(`  [${r.key}] ${r.content}`);
    }
    break;
  }

  case "forget": {
    const key = getArg("key");
    if (!key) { console.error("Usage: memory forget --key <key>"); process.exit(1); }
    const data = await post(`${BASE}/db/exec`, { table: "facts", operation: "delete", filters: { key } });
    console.log(data.ok ? `Forgot: ${key}` : `Failed: ${data.error}`);
    break;
  }

  case "list": {
    const data = await post(`${BASE}/db/query`, { table: "facts", select: "key,content", limit: 50 });
    const rows = (data.rows ?? []) as Array<{ key: string; content: string }>;
    if (rows.length === 0) { console.log("No stored facts."); break; }
    console.log(`${rows.length} fact(s):\n`);
    for (const f of rows) {
      console.log(`  ${f.key}: ${(f.content ?? "").slice(0, 80)}`);
    }
    break;
  }

  default:
    console.log("Usage: memory <remember|note|search|forget|list> [options]");
    console.log("\nCommands:");
    console.log("  remember   Store a long-term fact (--fact <text> [--tags <csv>])");
    console.log("  note       Add a daily note (--text <text>)");
    console.log("  search     Search all facts (--query <text>)");
    console.log("  forget     Remove a fact (--key <key>)");
    console.log("  list       List all fact keys");
}
