import Database, { type Database as DB } from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import { EventBus } from "../bus/bus.js";
import { MessageStore } from "../messages/store.js";

/** A single scheduled job row from SQLite. */
export interface Job {
  id: string;
  name: string;
  schedule: string;
  task: string;
  active: number;
  created_at: number;
  last_run_at: number | null;
  next_run_at: number | null;
}

export interface JobSchedulerConfig {
  /** Path to the schedules directory containing jobs.sqlite */
  schedulesDir: string;
  /** How often (ms) to poll for due jobs. Default 30_000. */
  pollIntervalMs?: number;
}

export interface JobSchedulerDeps {
  bus: EventBus;
  messages: MessageStore;
}

/**
 * Parse a schedule string and compute the next run timestamp.
 *
 * Supported formats:
 *   - "every Nm/Nh/Ns" — recurring interval
 *   - "in Nm/Nh/Ns"    — one-shot delay
 */
export function computeNextRun(schedule: string, fromMs: number): number | null {
  const s = schedule.trim().toLowerCase();

  const inMatch = s.match(/^in\s+(\d+)\s*(m|min|h|hr|hour|s|sec)$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const ms = unit.startsWith("h")
      ? amount * 3_600_000
      : unit.startsWith("s")
        ? amount * 1_000
        : amount * 60_000;
    return fromMs + ms;
  }

  const everyMatch = s.match(/^every\s+(\d+)\s*(m|min|h|hr|hour|s|sec)$/);
  if (everyMatch) {
    const amount = parseInt(everyMatch[1], 10);
    const unit = everyMatch[2];
    const ms = unit.startsWith("h")
      ? amount * 3_600_000
      : unit.startsWith("s")
        ? amount * 1_000
        : amount * 60_000;
    return fromMs + ms;
  }

  return null;
}

/**
 * Returns true if the schedule is recurring ("every ...").
 */
function isRecurring(schedule: string): boolean {
  return schedule.trim().toLowerCase().startsWith("every");
}

/**
 * JobScheduler polls the SQLite job database for due jobs and
 * fires them by creating push messages for the daemon to handle.
 */
export class JobScheduler {
  private db: DB | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs: number;
  private readonly schedulesDir: string;
  private bus: EventBus;
  private messages: MessageStore;

  constructor(config: JobSchedulerConfig, deps: JobSchedulerDeps) {
    this.schedulesDir = config.schedulesDir;
    this.pollIntervalMs = config.pollIntervalMs ?? 30_000;
    this.bus = deps.bus;
    this.messages = deps.messages;
  }

  /** Open the SQLite database. Creates directory and table if needed. */
  private ensureDb(): DB {
    if (this.db) return this.db;

    fs.mkdirSync(this.schedulesDir, { recursive: true });
    this.db = new Database(path.join(this.schedulesDir, "jobs.sqlite"));
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
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
    return this.db;
  }

  /** Start the polling loop. */
  start(): void {
    this.ensureDb();
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    // Fire immediately on start
    this.tick();
  }

  /** Stop the polling loop and close the database. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Single poll cycle: find all due jobs and execute them.
   * Exposed for testing.
   */
  tick(): number {
    const db = this.ensureDb();
    const now = Date.now();

    const dueJobs = db
      .prepare(
        "SELECT * FROM jobs WHERE active = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?",
      )
      .all(now) as Job[];

    for (const job of dueJobs) {
      this.executeJob(job, now);
    }

    return dueJobs.length;
  }

  /** Execute a single due job by spawning an agent to handle it. */
  private executeJob(job: Job, now: number): void {
    const db = this.ensureDb();

    console.log(`[scheduler] Firing job "${job.name}": ${job.task}`);

    // Create a push message for the record
    this.messages.append({
      role: "push",
      content: `[Scheduled Job: ${job.name}] ${job.task}`,
      metadata: { jobId: job.id, jobName: job.name, source: "scheduler" },
    });

    this.bus.emit("message:created", {
      id: job.id,
      role: "push",
      content: `[Scheduled Job: ${job.name}] ${job.task}`,
      timestamp: now,
      metadata: { jobId: job.id, source: "scheduler" },
    });

    // Spawn an agent to actually execute the task
    this.spawnJobAgent(job);

    if (isRecurring(job.schedule)) {
      // Compute next run from now (not from the scheduled time, to avoid catch-up storms)
      const nextRun = computeNextRun(job.schedule, now);
      db.prepare("UPDATE jobs SET last_run_at = ?, next_run_at = ? WHERE id = ?").run(
        now,
        nextRun,
        job.id,
      );
    } else {
      // One-shot: mark as done by clearing next_run_at and deactivating
      db.prepare("UPDATE jobs SET last_run_at = ?, next_run_at = NULL, active = 0 WHERE id = ?").run(
        now,
        job.id,
      );
    }
  }

  /** List all jobs. Useful for status/debug endpoints. */
  listJobs(): Job[] {
    const db = this.ensureDb();
    return db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all() as Job[];
  }

  /** Get count of active jobs. */
  activeJobCount(): number {
    const db = this.ensureDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM jobs WHERE active = 1").get() as {
      cnt: number;
    };
    return row.cnt;
  }

  /** Spawn a lightweight agent to execute a scheduled job's task. */
  private async spawnJobAgent(job: Job): Promise<void> {
    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      const { fileURLToPath } = await import("node:url");
      const pathMod = await import("node:path");
      const dirname = pathMod.dirname(fileURLToPath(import.meta.url));
      const projectRoot = pathMod.resolve(dirname, "..", "..");

      const q = query({
        prompt: `Execute this scheduled task now:\n\n${job.task}\n\nDo it and confirm briefly when done.`,
        options: {
          cwd: projectRoot,
          systemPrompt: `You are Rue executing a scheduled job called "${job.name}". Do exactly what the task says. Use the available tools (Bash, Read, Write, etc.) to complete it. Be quick and direct. If the task says to send a Telegram message, use: node --import tsx/esm skills/telegram/run.ts send --message "..."`,
          tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"],
          allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"],
          permissionMode: "bypassPermissions" as const,
          allowDangerouslySkipPermissions: true,
          maxTurns: 10,
          settingSources: [],
        },
      });

      let output = "";
      for await (const message of q) {
        if (message.type === "assistant") {
          const content = (message as { message: { content: Array<{ type: string; text?: string }> } }).message.content;
          for (const block of content) {
            if (block.type === "text" && block.text) output += block.text;
          }
        }
        if (message.type === "result") {
          const r = message as { subtype: string; result?: string };
          if (r.subtype === "success" && r.result) output = r.result;
        }
      }

      console.log(`[scheduler] Job "${job.name}" completed: ${output.slice(0, 100)}`);
    } catch (err) {
      console.error(`[scheduler] Job "${job.name}" failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
