#!/usr/bin/env tsx
/**
 * Triggers skill — manage event-driven triggers via Supabase.
 */
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

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
    if (!name || !event || !action) {
      console.error("Usage: triggers create --name <name> --event <event> --action <action>");
      process.exit(1);
    }
    const id = `trigger_${Date.now().toString(36)}`;
    const now = Date.now();
    const data = await post(`${BASE}/db/exec`, {
      table: "triggers", operation: "insert",
      data: { id, name, event, action, enabled: true, created_at: now, updated_at: now },
    });
    if (data.ok) {
      console.log(`Created trigger: ${name}`);
      console.log(`  ID: ${id}`);
      console.log(`  Event: ${event}`);
      console.log(`  Action: ${action}`);
    } else {
      console.error(`Failed: ${data.error}`);
    }
    break;
  }

  case "list": {
    const data = await post(`${BASE}/db/query`, { table: "triggers" });
    const triggers = (data.rows ?? []) as Array<Record<string, unknown>>;
    if (triggers.length === 0) {
      console.log("No triggers configured.");
    } else {
      console.log(`${triggers.length} trigger(s):\n`);
      for (const t of triggers) {
        const status = t.enabled ? "active" : "paused";
        console.log(`  ${t.name} [${status}]`);
        console.log(`    ID: ${t.id}`);
        console.log(`    Event: ${t.event}`);
        console.log(`    Action: ${t.action}\n`);
      }
    }
    break;
  }

  case "remove": {
    const id = getArg("id");
    if (!id) { console.error("Usage: triggers remove --id <id>"); process.exit(1); }
    const data = await post(`${BASE}/db/exec`, { table: "triggers", operation: "delete", filters: { id } });
    console.log(data.ok ? `Removed trigger: ${id}` : `Failed: ${data.error}`);
    break;
  }

  case "toggle": {
    const id = getArg("id");
    const enabled = getArg("enabled");
    if (!id || enabled === undefined) { console.error("Usage: triggers toggle --id <id> --enabled true|false"); process.exit(1); }
    const data = await post(`${BASE}/db/exec`, {
      table: "triggers", operation: "update",
      data: { enabled: enabled === "true", updated_at: Date.now() },
      filters: { id },
    });
    console.log(data.ok ? `Trigger ${id} ${enabled === "true" ? "enabled" : "disabled"}` : `Failed: ${data.error}`);
    break;
  }

  default:
    console.log("Usage: triggers <create|list|remove|toggle> [options]");
}
