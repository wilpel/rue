#!/usr/bin/env tsx
import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const dataDir = path.join(os.homedir(), ".rue", "schedules");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "jobs.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schedule TEXT NOT NULL,
    task TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_run_at INTEGER,
    next_run_at INTEGER
  )
`);

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function computeNextRun(schedule: string, fromMs: number): number | null {
  const s = schedule.trim().toLowerCase();
  const inMatch = s.match(/^in\s+(\d+)\s*(m|min|h|hr|hour|s|sec)$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const ms = unit.startsWith("h") ? amount * 3600_000 : unit.startsWith("s") ? amount * 1000 : amount * 60_000;
    return fromMs + ms;
  }
  const everyMatch = s.match(/^every\s+(\d+)\s*(m|min|h|hr|hour|s|sec)$/);
  if (everyMatch) {
    const amount = parseInt(everyMatch[1], 10);
    const unit = everyMatch[2];
    const ms = unit.startsWith("h") ? amount * 3600_000 : unit.startsWith("s") ? amount * 1000 : amount * 60_000;
    return fromMs + ms;
  }
  return null;
}

switch (command) {
  case "create": {
    const name = getArg("name");
    const schedule = getArg("schedule");
    const task = getArg("task");
    if (!name || !schedule || !task) {
      console.error("Usage: run.ts create --name <name> --schedule <schedule> --task <task>");
      process.exit(1);
    }
    const id = `job_${Date.now().toString(36)}`;
    const now = Date.now();
    const nextRun = computeNextRun(schedule, now);
    db.prepare(
      "INSERT INTO jobs (id, name, schedule, task, active, created_at, next_run_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
    ).run(id, name, schedule, task, now, nextRun);
    console.log(`Created job: ${name}`);
    console.log(`  ID: ${id}`);
    console.log(`  Schedule: ${schedule}`);
    console.log(`  Task: ${task}`);
    console.log(`  Next run: ${nextRun ? new Date(nextRun).toLocaleString() : "pending"}`);
    break;
  }

  case "list": {
    const jobs = db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all() as Array<{
      id: string; name: string; schedule: string; task: string; active: number;
      created_at: number; last_run_at: number | null; next_run_at: number | null;
    }>;
    if (jobs.length === 0) {
      console.log("No scheduled jobs.");
    } else {
      console.log(`${jobs.length} job(s):\n`);
      for (const j of jobs) {
        const status = j.active ? "active" : "paused";
        const lastRun = j.last_run_at ? new Date(j.last_run_at).toLocaleString() : "never";
        const nextRun = j.next_run_at ? new Date(j.next_run_at).toLocaleString() : "n/a";
        console.log(`  ${j.name} [${status}]`);
        console.log(`    ID: ${j.id}`);
        console.log(`    Schedule: ${j.schedule}`);
        console.log(`    Task: ${j.task}`);
        console.log(`    Last run: ${lastRun} | Next: ${nextRun}\n`);
      }
    }
    break;
  }

  case "remove": {
    const id = getArg("id");
    if (!id) { console.error("Usage: run.ts remove --id <id>"); process.exit(1); }
    const result = db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
    console.log(result.changes ? `Removed job: ${id}` : `Job not found: ${id}`);
    break;
  }

  case "toggle": {
    const id = getArg("id");
    const active = getArg("active");
    if (!id || active === undefined) { console.error("Usage: run.ts toggle --id <id> --active true|false"); process.exit(1); }
    db.prepare("UPDATE jobs SET active = ? WHERE id = ?").run(active === "true" ? 1 : 0, id);
    console.log(`Job ${id} ${active === "true" ? "activated" : "paused"}`);
    break;
  }

  default:
    console.log("Usage: run.ts <create|list|remove|toggle> [options]");
    console.log("Run with --help on any command for details.");
}

db.close();
