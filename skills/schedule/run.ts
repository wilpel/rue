#!/usr/bin/env tsx

/**
 * Schedule skill — creates scheduled and reminder tasks via the daemon API.
 * Uses the unified tasks system (same table shown in sidebar).
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function loadConfig(): { port: number } {
  const configPath = path.join(os.homedir(), ".rue", "config.json");
  if (fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return { port: raw.port ?? 18800 };
  }
  return { port: 18800 };
}

function parseDue(due: string): number | null {
  const s = due.trim().toLowerCase();
  const match = s.match(/^in\s+(\d+)\s*(m|min|h|hr|hour|s|sec|d|day)$/);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const ms = unit.startsWith("d") ? amount * 86_400_000 : unit.startsWith("h") ? amount * 3_600_000 : unit.startsWith("s") ? amount * 1_000 : amount * 60_000;
  return Date.now() + ms;
}

const config = loadConfig();
const baseUrl = `http://127.0.0.1:${config.port}/api/tasks`;

switch (command) {
  case "create": {
    const name = getArg("name");
    const schedule = getArg("schedule");
    const task = getArg("task");
    const type = getArg("type") ?? "scheduled";
    if (!name || !task) {
      console.error("Usage: run.ts create --name <name> --task <task> [--schedule <schedule>] [--type scheduled|reminder]");
      process.exit(1);
    }

    const dueAt = schedule ? parseDue(schedule) ?? parseDue(`in ${schedule}`) : undefined;

    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: name,
          description: task,
          type,
          schedule: schedule ?? undefined,
          dueAt: dueAt ?? undefined,
        }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (data.id) {
        console.log(`Created ${type}: ${name}`);
        console.log(`  ID: ${data.id}`);
        if (schedule) console.log(`  Schedule: ${schedule}`);
        if (dueAt) console.log(`  Due: ${new Date(dueAt).toLocaleString()}`);
        console.log(`  Task: ${task}`);
      } else {
        console.error(`Failed: ${data.error ?? "unknown error"}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`Failed to reach daemon: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    break;
  }

  case "list": {
    try {
      const statusFilter = getArg("status") ?? "";
      const url = statusFilter ? `${baseUrl}?type=scheduled&status=${statusFilter}` : `${baseUrl}?type=scheduled`;
      const res = await fetch(url);
      const data = await res.json() as { tasks: Array<Record<string, unknown>> };
      const tasks = data.tasks ?? [];

      // Also fetch reminders
      const remUrl = statusFilter ? `${baseUrl}?type=reminder&status=${statusFilter}` : `${baseUrl}?type=reminder`;
      const remRes = await fetch(remUrl);
      const remData = await remRes.json() as { tasks: Array<Record<string, unknown>> };
      tasks.push(...(remData.tasks ?? []));

      if (tasks.length === 0) {
        console.log("No scheduled tasks or reminders.");
      } else {
        console.log(`${tasks.length} scheduled item(s):\n`);
        for (const t of tasks) {
          const dueStr = t.due_at ? new Date(t.due_at as number).toLocaleString() : "no due date";
          console.log(`  ${t.title} [${t.status}] (${t.type})`);
          console.log(`    ID: ${t.id}`);
          if (t.schedule) console.log(`    Schedule: ${t.schedule}`);
          console.log(`    Due: ${dueStr}`);
          if (t.description) console.log(`    Task: ${(t.description as string).slice(0, 100)}`);
          console.log();
        }
      }
    } catch (err) {
      console.error(`Failed to reach daemon: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    break;
  }

  case "remove": {
    const id = getArg("id");
    if (!id) { console.error("Usage: run.ts remove --id <id>"); process.exit(1); }
    try {
      const res = await fetch(`${baseUrl}/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json() as { ok: boolean };
      console.log(data.ok ? `Removed: ${id}` : `Not found: ${id}`);
    } catch (err) {
      console.error(`Failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    break;
  }

  case "pause": {
    const id = getArg("id");
    if (!id) { console.error("Usage: run.ts pause --id <id>"); process.exit(1); }
    try {
      await fetch(`${baseUrl}/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      console.log(`Paused: ${id}`);
    } catch (err) {
      console.error(`Failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    break;
  }

  case "resume": {
    const id = getArg("id");
    if (!id) { console.error("Usage: run.ts resume --id <id>"); process.exit(1); }
    try {
      await fetch(`${baseUrl}/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      });
      console.log(`Resumed: ${id}`);
    } catch (err) {
      console.error(`Failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    break;
  }

  default:
    console.log("Usage: run.ts <create|list|remove|pause|resume> [options]");
    console.log("\nExamples:");
    console.log('  create --name "Health check" --schedule "every 1h" --task "Ping the server"');
    console.log('  create --name "Review PR" --schedule "in 2h" --task "Check PR #42" --type reminder');
    console.log("  list");
    console.log("  remove --id task_abc123");
}
