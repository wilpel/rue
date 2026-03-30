#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";

const MEMORY_DIR = path.join(os.homedir(), ".rue", "memory");
const DAILY_DIR = path.join(MEMORY_DIR, "daily");
const MEMORY_FILE = path.join(MEMORY_DIR, "MEMORY.md");
const DB_PATH = path.join(MEMORY_DIR, "semantic", "knowledge.sqlite");

fs.mkdirSync(DAILY_DIR, { recursive: true });
fs.mkdirSync(path.join(MEMORY_DIR, "semantic"), { recursive: true });

// Ensure MEMORY.md exists
if (!fs.existsSync(MEMORY_FILE)) {
  fs.writeFileSync(MEMORY_FILE, "# Memory\n\nLong-term facts and knowledge.\n");
}

// Ensure DB exists
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS facts (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

switch (command) {
  case "remember": {
    const fact = getArg("fact");
    const tags = getArg("tags") ?? "";
    if (!fact) { console.error("Usage: run.ts remember --fact <text> [--tags <comma,separated>]"); process.exit(1); }

    const key = `fact-${Date.now().toString(36)}`;
    const tagArr = tags ? tags.split(",").map(t => t.trim()) : [];
    const now = Date.now();

    // Store in SQLite for search
    db.prepare("INSERT OR REPLACE INTO facts (key, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(key, fact, JSON.stringify(tagArr), now, now);

    // Append to MEMORY.md
    const entry = `\n- ${fact}${tagArr.length ? ` _(${tagArr.join(", ")})_` : ""}\n`;
    fs.appendFileSync(MEMORY_FILE, entry);

    console.log(`Remembered: ${fact}`);
    console.log(`  Key: ${key}`);
    if (tagArr.length) console.log(`  Tags: ${tagArr.join(", ")}`);
    break;
  }

  case "note": {
    const text = getArg("text");
    if (!text) { console.error("Usage: run.ts note --text <text>"); process.exit(1); }

    const dailyFile = path.join(DAILY_DIR, `${today()}.md`);
    const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

    if (!fs.existsSync(dailyFile)) {
      fs.writeFileSync(dailyFile, `# Notes — ${today()}\n`);
    }

    fs.appendFileSync(dailyFile, `\n- **${time}** ${text}\n`);
    console.log(`Note added to ${today()}.md`);
    break;
  }

  case "search": {
    const query = getArg("query");
    if (!query) { console.error("Usage: run.ts search --query <text>"); process.exit(1); }

    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) { console.log("No results."); break; }

    // Search SQLite facts
    const allFacts = db.prepare("SELECT * FROM facts").all() as Array<{
      key: string; content: string; tags: string; created_at: number; updated_at: number;
    }>;

    const results = allFacts
      .map(f => {
        const lower = f.content.toLowerCase() + " " + f.tags.toLowerCase();
        let score = 0;
        for (const w of words) { if (lower.includes(w)) score++; }
        return { ...f, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Also search MEMORY.md
    const memContent = fs.readFileSync(MEMORY_FILE, "utf-8");
    const memLines = memContent.split("\n").filter(l => l.trim().startsWith("- "));
    const memResults = memLines
      .map(line => {
        const lower = line.toLowerCase();
        let score = 0;
        for (const w of words) { if (lower.includes(w)) score++; }
        return { line: line.trim(), score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Also search recent daily notes
    const dailyFiles = fs.readdirSync(DAILY_DIR).filter(f => f.endsWith(".md")).sort().reverse().slice(0, 7);
    const dailyResults: Array<{ file: string; line: string; score: number }> = [];
    for (const file of dailyFiles) {
      const content = fs.readFileSync(path.join(DAILY_DIR, file), "utf-8");
      const lines = content.split("\n").filter(l => l.trim().startsWith("- "));
      for (const line of lines) {
        const lower = line.toLowerCase();
        let score = 0;
        for (const w of words) { if (lower.includes(w)) score++; }
        if (score > 0) dailyResults.push({ file, line: line.trim(), score });
      }
    }
    dailyResults.sort((a, b) => b.score - a.score);

    if (results.length === 0 && memResults.length === 0 && dailyResults.length === 0) {
      console.log("No results found.");
      break;
    }

    if (results.length > 0) {
      console.log("Facts:");
      for (const r of results) {
        console.log(`  [${r.key}] ${r.content}`);
      }
    }
    if (memResults.length > 0) {
      console.log("\nFrom MEMORY.md:");
      for (const r of memResults) {
        console.log(`  ${r.line}`);
      }
    }
    if (dailyResults.length > 0) {
      console.log("\nFrom daily notes:");
      for (const r of dailyResults.slice(0, 5)) {
        console.log(`  [${r.file}] ${r.line}`);
      }
    }
    break;
  }

  case "read": {
    console.log(fs.readFileSync(MEMORY_FILE, "utf-8"));
    break;
  }

  case "today": {
    const dailyFile = path.join(DAILY_DIR, `${today()}.md`);
    if (!fs.existsSync(dailyFile)) {
      console.log("No notes for today.");
    } else {
      console.log(fs.readFileSync(dailyFile, "utf-8"));
    }
    break;
  }

  case "day": {
    const date = getArg("date");
    if (!date) { console.error("Usage: run.ts day --date YYYY-MM-DD"); process.exit(1); }
    const dailyFile = path.join(DAILY_DIR, `${date}.md`);
    if (!fs.existsSync(dailyFile)) {
      console.log(`No notes for ${date}.`);
    } else {
      console.log(fs.readFileSync(dailyFile, "utf-8"));
    }
    break;
  }

  case "forget": {
    const key = getArg("key");
    if (!key) { console.error("Usage: run.ts forget --key <key>"); process.exit(1); }
    const result = db.prepare("DELETE FROM facts WHERE key = ?").run(key);
    console.log(result.changes ? `Forgot: ${key}` : `Not found: ${key}`);
    break;
  }

  case "list": {
    const facts = db.prepare("SELECT key, substr(content, 1, 80) as preview FROM facts ORDER BY updated_at DESC").all() as Array<{ key: string; preview: string }>;
    if (facts.length === 0) {
      console.log("No stored facts.");
    } else {
      console.log(`${facts.length} fact(s):\n`);
      for (const f of facts) {
        console.log(`  ${f.key}: ${f.preview}`);
      }
    }
    break;
  }

  default:
    console.log("Usage: run.ts <remember|note|search|read|today|day|forget|list> [options]");
    console.log("\nCommands:");
    console.log("  remember   Store a long-term fact");
    console.log("  note       Add a daily note");
    console.log("  search     Search all memories");
    console.log("  read       Read MEMORY.md");
    console.log("  today      Read today's notes");
    console.log("  day        Read a specific day's notes");
    console.log("  forget     Remove a fact");
    console.log("  list       List all fact keys");
}

db.close();
