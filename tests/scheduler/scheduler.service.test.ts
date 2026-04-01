import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SchedulerService, computeNextRun } from "../../src/scheduler/scheduler.service.js";
import { DatabaseService } from "../../src/database/database.service.js";
import type { DelegateService } from "../../src/agents/delegate.service.js";

describe("computeNextRun", () => {
  it("parses 'every 5m'", () => {
    const next = computeNextRun("every 5m", 1000);
    expect(next).toBe(1000 + 5 * 60_000);
  });

  it("parses 'in 1h'", () => {
    const next = computeNextRun("in 1h", 0);
    expect(next).toBe(3_600_000);
  });

  it("parses 'every 30s'", () => {
    const next = computeNextRun("every 30s", 0);
    expect(next).toBe(30_000);
  });

  it("parses 'in 1d'", () => {
    const next = computeNextRun("in 1d", 0);
    expect(next).toBe(86_400_000);
  });

  it("returns null for invalid schedule", () => {
    expect(computeNextRun("at midnight", 0)).toBeNull();
  });
});

describe("SchedulerService", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let scheduler: SchedulerService;
  let mockDelegate: DelegateService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-sched-test-"));
    dbService = new DatabaseService(tmpDir);
    mockDelegate = { spawn: vi.fn().mockResolvedValue(undefined), listDelegates: vi.fn(), getDelegate: vi.fn(), shutdown: vi.fn() } as unknown as DelegateService;
    scheduler = new SchedulerService(dbService, mockDelegate);
  });

  afterEach(() => {
    scheduler.stop();
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function insertTask(id: string, title: string, schedule: string, type: string, dueAt: number | null, status = "pending") {
    const now = Date.now();
    dbService.getDb().prepare(
      "INSERT INTO tasks (id, title, status, type, priority, schedule, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, title, status, type, "normal", schedule, dueAt, now, now);
  }

  it("fires due scheduled tasks", () => {
    const now = Date.now();
    insertTask("t1", "test-job", "every 1m", "scheduled", now - 1000);

    const count = scheduler.tick();
    expect(count).toBe(1);
    expect(mockDelegate.spawn).toHaveBeenCalled();
  });

  it("fires due reminder tasks", () => {
    const now = Date.now();
    insertTask("t2", "remind me", "in 1m", "reminder", now - 1000);

    const count = scheduler.tick();
    expect(count).toBe(1);
    expect(mockDelegate.spawn).toHaveBeenCalled();
  });

  it("skips work tasks", () => {
    const now = Date.now();
    insertTask("t3", "work item", "", "work", now - 1000);

    expect(scheduler.tick()).toBe(0);
  });

  it("skips completed tasks", () => {
    const now = Date.now();
    insertTask("t4", "done task", "every 1m", "scheduled", now - 1000, "completed");

    expect(scheduler.tick()).toBe(0);
  });

  it("skips tasks not yet due", () => {
    const now = Date.now();
    insertTask("t5", "future task", "every 1m", "scheduled", now + 60_000);

    expect(scheduler.tick()).toBe(0);
  });

  it("updates due_at for recurring tasks", () => {
    const now = Date.now();
    insertTask("t6", "recurring", "every 5m", "scheduled", now - 1000);

    scheduler.tick();
    const updated = dbService.getDb().prepare("SELECT * FROM tasks WHERE id = ?").get("t6") as { due_at: number; status: string };
    expect(updated.due_at).toBeGreaterThan(now);
    expect(updated.status).toBe("pending");
  });

  it("completes one-shot tasks", () => {
    const now = Date.now();
    insertTask("t7", "oneshot", "in 1m", "scheduled", now - 1000);

    scheduler.tick();
    const updated = dbService.getDb().prepare("SELECT * FROM tasks WHERE id = ?").get("t7") as { status: string; completed_at: number };
    expect(updated.status).toBe("completed");
    expect(updated.completed_at).toBeGreaterThan(0);
  });

  it("lists scheduled and reminder tasks", () => {
    const now = Date.now();
    insertTask("t8", "sched", "every 1m", "scheduled", now + 60_000);
    insertTask("t9", "remind", "in 1h", "reminder", now + 3_600_000);
    insertTask("t10", "work", "", "work", null);

    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(2);
  });
});
