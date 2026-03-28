#!/usr/bin/env tsx
import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const dataDir = path.join(os.homedir(), ".rue", "triggers");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "triggers.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS triggers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    event TEXT NOT NULL,
    condition TEXT NOT NULL DEFAULT '*',
    action TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    fire_count INTEGER NOT NULL DEFAULT 0
  )
`);

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

switch (command) {
  case "create": {
    const name = getArg("name");
    const event = getArg("event");
    const action = getArg("action");
    const condition = getArg("condition") ?? "*";
    if (!name || !event || !action) {
      console.error("Usage: run.ts create --name <name> --event <event> --action <action> [--condition <json>]");
      process.exit(1);
    }
    const id = `trigger_${Date.now().toString(36)}`;
    db.prepare(
      "INSERT INTO triggers (id, name, event, condition, action, active, created_at, fire_count) VALUES (?, ?, ?, ?, ?, 1, ?, 0)",
    ).run(id, name, event, condition, action, Date.now());
    console.log(`Created trigger: ${name}`);
    console.log(`  ID: ${id}`);
    console.log(`  Event: ${event}`);
    console.log(`  Condition: ${condition}`);
    console.log(`  Action: ${action}`);
    break;
  }

  case "list": {
    const triggers = db.prepare("SELECT * FROM triggers ORDER BY created_at DESC").all() as Array<{
      id: string; name: string; event: string; condition: string; action: string;
      active: number; created_at: number; fire_count: number;
    }>;
    if (triggers.length === 0) {
      console.log("No triggers configured.");
    } else {
      console.log(`${triggers.length} trigger(s):\n`);
      for (const t of triggers) {
        const status = t.active ? "active" : "paused";
        console.log(`  ${t.name} [${status}] (fired ${t.fire_count}x)`);
        console.log(`    ID: ${t.id}`);
        console.log(`    Event: ${t.event} ${t.condition !== "*" ? `(if ${t.condition})` : ""}`);
        console.log(`    Action: ${t.action}\n`);
      }
    }
    break;
  }

  case "remove": {
    const id = getArg("id");
    if (!id) { console.error("Usage: run.ts remove --id <id>"); process.exit(1); }
    const result = db.prepare("DELETE FROM triggers WHERE id = ?").run(id);
    console.log(result.changes ? `Removed trigger: ${id}` : `Trigger not found: ${id}`);
    break;
  }

  case "toggle": {
    const id = getArg("id");
    const active = getArg("active");
    if (!id || active === undefined) { console.error("Usage: run.ts toggle --id <id> --active true|false"); process.exit(1); }
    db.prepare("UPDATE triggers SET active = ? WHERE id = ?").run(active === "true" ? 1 : 0, id);
    console.log(`Trigger ${id} ${active === "true" ? "enabled" : "disabled"}`);
    break;
  }

  default:
    console.log("Usage: run.ts <create|list|remove|toggle> [options]");
}

db.close();
