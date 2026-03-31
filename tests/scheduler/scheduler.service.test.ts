import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SchedulerService, computeNextRun } from "../../src/scheduler/scheduler.service.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { jobs } from "../../src/database/schema.js";
import type { InboxService } from "../../src/inbox/inbox.service.js";
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

  it("returns null for invalid schedule", () => {
    expect(computeNextRun("at midnight", 0)).toBeNull();
  });
});

describe("SchedulerService", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let scheduler: SchedulerService;
  let mockInbox: InboxService;
  let mockDelegate: DelegateService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-sched-test-"));
    dbService = new DatabaseService(tmpDir);
    mockInbox = { push: vi.fn(), onMessage: vi.fn(), formatPrefix: vi.fn() } as unknown as InboxService;
    mockDelegate = { spawn: vi.fn().mockResolvedValue(undefined), listDelegates: vi.fn(), getDelegate: vi.fn(), shutdown: vi.fn() } as unknown as DelegateService;
    scheduler = new SchedulerService(dbService, mockInbox, mockDelegate);
  });

  afterEach(() => {
    scheduler.stop();
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fires due jobs", () => {
    const now = Date.now();
    dbService.getDrizzle().insert(jobs).values({
      id: "j1", name: "test-job", schedule: "every 1m", task: "do something",
      active: 1, createdAt: now, nextRunAt: now - 1000,
    }).run();

    const count = scheduler.tick();
    expect(count).toBe(1);
    expect(mockInbox.push).toHaveBeenCalledWith("scheduler", expect.stringContaining("test-job"), expect.any(Object));
    expect(mockDelegate.spawn).toHaveBeenCalled();
  });

  it("skips inactive jobs", () => {
    const now = Date.now();
    dbService.getDrizzle().insert(jobs).values({
      id: "j2", name: "inactive", schedule: "every 1m", task: "skip me",
      active: 0, createdAt: now, nextRunAt: now - 1000,
    }).run();

    expect(scheduler.tick()).toBe(0);
  });

  it("updates next_run for recurring jobs", () => {
    const now = Date.now();
    dbService.getDrizzle().insert(jobs).values({
      id: "j3", name: "recurring", schedule: "every 5m", task: "repeat",
      active: 1, createdAt: now, nextRunAt: now - 1000,
    }).run();

    scheduler.tick();
    const updated = dbService.getDrizzle().select().from(jobs).all()[0];
    expect(updated.nextRunAt).toBeGreaterThan(now);
    expect(updated.active).toBe(1);
  });

  it("deactivates one-shot jobs", () => {
    const now = Date.now();
    dbService.getDrizzle().insert(jobs).values({
      id: "j4", name: "oneshot", schedule: "in 1m", task: "once",
      active: 1, createdAt: now, nextRunAt: now - 1000,
    }).run();

    scheduler.tick();
    const updated = dbService.getDrizzle().select().from(jobs).all()[0];
    expect(updated.active).toBe(0);
    expect(updated.nextRunAt).toBeNull();
  });

  it("lists all jobs", () => {
    const now = Date.now();
    dbService.getDrizzle().insert(jobs).values({ id: "j5", name: "a", schedule: "every 1m", task: "t", active: 1, createdAt: now }).run();
    dbService.getDrizzle().insert(jobs).values({ id: "j6", name: "b", schedule: "every 1m", task: "t", active: 0, createdAt: now }).run();
    expect(scheduler.listJobs()).toHaveLength(2);
  });
});
