import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JobScheduler, computeNextRun, type Job } from "../../src/daemon/scheduler.js";
import { EventBus } from "../../src/bus/bus.js";
import { MessageStore } from "../../src/messages/store.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rue-scheduler-test-"));
}

describe("computeNextRun", () => {
  const base = 1_000_000;

  it("parses 'every Nm' schedules", () => {
    expect(computeNextRun("every 5m", base)).toBe(base + 5 * 60_000);
    expect(computeNextRun("every 10 min", base)).toBe(base + 10 * 60_000);
  });

  it("parses 'every Nh' schedules", () => {
    expect(computeNextRun("every 2h", base)).toBe(base + 2 * 3_600_000);
    expect(computeNextRun("every 1 hr", base)).toBe(base + 1 * 3_600_000);
    expect(computeNextRun("every 3 hour", base)).toBe(base + 3 * 3_600_000);
  });

  it("parses 'every Ns' schedules", () => {
    expect(computeNextRun("every 30s", base)).toBe(base + 30_000);
    expect(computeNextRun("every 10 sec", base)).toBe(base + 10_000);
  });

  it("parses 'in Nm' one-shot schedules", () => {
    expect(computeNextRun("in 5m", base)).toBe(base + 5 * 60_000);
  });

  it("parses 'in Nh' one-shot schedules", () => {
    expect(computeNextRun("in 1h", base)).toBe(base + 3_600_000);
  });

  it("returns null for unrecognized schedules", () => {
    expect(computeNextRun("cron * * * * *", base)).toBeNull();
    expect(computeNextRun("bogus", base)).toBeNull();
  });

  it("handles leading/trailing whitespace", () => {
    expect(computeNextRun("  every 5m  ", base)).toBe(base + 5 * 60_000);
  });
});

describe("JobScheduler", () => {
  let tmpDir: string;
  let schedulesDir: string;
  let messagesDir: string;
  let bus: EventBus;
  let messages: MessageStore;
  let scheduler: JobScheduler;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    schedulesDir = path.join(tmpDir, "schedules");
    messagesDir = path.join(tmpDir, "messages");
    bus = new EventBus();
    messages = new MessageStore(messagesDir);
    scheduler = new JobScheduler(
      { schedulesDir, pollIntervalMs: 50 },
      { bus, messages },
    );
  });

  afterEach(() => {
    scheduler.stop();
    messages.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function insertJob(overrides: Partial<Job> = {}): Job {
    const job: Job = {
      id: overrides.id ?? `job_test_${Date.now()}`,
      name: overrides.name ?? "test-job",
      schedule: overrides.schedule ?? "every 5m",
      task: overrides.task ?? "do something",
      active: overrides.active ?? 1,
      created_at: overrides.created_at ?? Date.now(),
      last_run_at: overrides.last_run_at ?? null,
      next_run_at: "next_run_at" in overrides ? overrides.next_run_at! : Date.now() - 1000, // due by default
    };

    fs.mkdirSync(schedulesDir, { recursive: true });
    const db = new Database(path.join(schedulesDir, "jobs.sqlite"));
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, schedule TEXT NOT NULL,
        task TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL, last_run_at INTEGER, next_run_at INTEGER
      )
    `);
    db.prepare(
      "INSERT INTO jobs (id, name, schedule, task, active, created_at, last_run_at, next_run_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(job.id, job.name, job.schedule, job.task, job.active, job.created_at, job.last_run_at, job.next_run_at);
    db.close();
    return job;
  }

  it("finds and executes due jobs on tick", () => {
    const job = insertJob({ name: "tick-test", task: "run tests" });

    const executed = scheduler.tick();

    expect(executed).toBe(1);

    // Should have created a push message
    const msgs = messages.recent(10);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("push");
    expect(msgs[0].content).toContain("tick-test");
    expect(msgs[0].content).toContain("run tests");
  });

  it("emits message:created on the bus", () => {
    const handler = vi.fn();
    bus.on("message:created", handler);

    insertJob({ name: "bus-test" });
    scheduler.tick();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "push",
        content: expect.stringContaining("bus-test"),
      }),
    );
  });

  it("skips inactive jobs", () => {
    insertJob({ active: 0, next_run_at: Date.now() - 1000 });

    const executed = scheduler.tick();
    expect(executed).toBe(0);
    expect(messages.recent(10)).toHaveLength(0);
  });

  it("skips jobs not yet due", () => {
    insertJob({ next_run_at: Date.now() + 60_000 });

    const executed = scheduler.tick();
    expect(executed).toBe(0);
  });

  it("reschedules recurring jobs after execution", () => {
    insertJob({
      id: "job_recurring",
      schedule: "every 10m",
      next_run_at: Date.now() - 1000,
    });

    scheduler.tick();

    // Read the job directly to check it was rescheduled
    const jobs = scheduler.listJobs();
    const job = jobs.find((j) => j.id === "job_recurring")!;
    expect(job.last_run_at).toBeTypeOf("number");
    expect(job.next_run_at).toBeTypeOf("number");
    expect(job.next_run_at!).toBeGreaterThan(Date.now() - 1000);
    expect(job.active).toBe(1);
  });

  it("deactivates one-shot jobs after execution", () => {
    insertJob({
      id: "job_oneshot",
      schedule: "in 5m",
      next_run_at: Date.now() - 1000,
    });

    scheduler.tick();

    const jobs = scheduler.listJobs();
    const job = jobs.find((j) => j.id === "job_oneshot")!;
    expect(job.active).toBe(0);
    expect(job.next_run_at).toBeNull();
    expect(job.last_run_at).toBeTypeOf("number");
  });

  it("handles multiple due jobs in a single tick", () => {
    insertJob({ id: "job_a", name: "job-a" });
    insertJob({ id: "job_b", name: "job-b" });
    insertJob({ id: "job_c", name: "job-c" });

    const executed = scheduler.tick();
    expect(executed).toBe(3);
    expect(messages.recent(10)).toHaveLength(3);
  });

  it("reports active job count", () => {
    insertJob({ id: "active1", active: 1 });
    insertJob({ id: "active2", active: 1 });
    insertJob({ id: "inactive", active: 0, next_run_at: Date.now() - 1000 });

    expect(scheduler.activeJobCount()).toBe(2);
  });

  it("start/stop lifecycle works", async () => {
    insertJob({ id: "lifecycle", next_run_at: Date.now() - 1000 });

    scheduler.start();
    // Wait for at least one poll cycle
    await new Promise((r) => setTimeout(r, 80));
    scheduler.stop();

    expect(messages.recent(10).length).toBeGreaterThanOrEqual(1);
  });

  it("does not execute jobs with null next_run_at", () => {
    insertJob({ next_run_at: null });

    const executed = scheduler.tick();
    expect(executed).toBe(0);
  });
});
