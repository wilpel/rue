import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { InboxService } from "../inbox/inbox.service.js";
import { DelegateService } from "../agents/delegate.service.js";
import { jobs } from "../database/schema.js";
import { eq, and, lte } from "drizzle-orm";
import { log } from "../shared/logger.js";

export function computeNextRun(schedule: string, fromMs: number): number | null {
  const s = schedule.trim().toLowerCase();
  const inMatch = s.match(/^in\s+(\d+)\s*(m|min|h|hr|hour|s|sec)$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const ms = unit.startsWith("h") ? amount * 3_600_000 : unit.startsWith("s") ? amount * 1_000 : amount * 60_000;
    return fromMs + ms;
  }
  const everyMatch = s.match(/^every\s+(\d+)\s*(m|min|h|hr|hour|s|sec)$/);
  if (everyMatch) {
    const amount = parseInt(everyMatch[1], 10);
    const unit = everyMatch[2];
    const ms = unit.startsWith("h") ? amount * 3_600_000 : unit.startsWith("s") ? amount * 1_000 : amount * 60_000;
    return fromMs + ms;
  }
  return null;
}

function isRecurring(schedule: string): boolean {
  return schedule.trim().toLowerCase().startsWith("every");
}

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs = 30_000;

  constructor(
    private readonly db: DatabaseService,
    private readonly inbox: InboxService,
    private readonly delegate: DelegateService,
  ) {}

  onModuleInit(): void {
    this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    this.tick();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  tick(): number {
    const now = Date.now();
    const dueJobs = this.db.getDrizzle()
      .select()
      .from(jobs)
      .where(and(eq(jobs.active, 1), lte(jobs.nextRunAt, now)))
      .all()
      .filter(j => j.nextRunAt !== null);

    for (const job of dueJobs) {
      this.executeJob(job, now);
    }
    return dueJobs.length;
  }

  private executeJob(job: typeof jobs.$inferSelect, now: number): void {
    log.info(`[scheduler] Firing job "${job.name}": ${job.task}`);

    // Push to inbox so main agent knows
    this.inbox.push("scheduler", `[Scheduled Job: ${job.name}] ${job.task}`, { jobId: job.id, jobName: job.name });

    // Spawn delegate to do the actual work (fire-and-forget, no chatId needed for scheduler)
    // For now scheduler jobs don't have a chatId — they push results to inbox
    this.delegate.spawn(job.task, 0).catch(err => {
      log.error(`[scheduler] Job "${job.name}" agent failed: ${err instanceof Error ? err.message : err}`);
    });

    if (isRecurring(job.schedule)) {
      const nextRun = computeNextRun(job.schedule, now);
      this.db.getDrizzle().update(jobs).set({ lastRunAt: now, nextRunAt: nextRun }).where(eq(jobs.id, job.id)).run();
    } else {
      this.db.getDrizzle().update(jobs).set({ lastRunAt: now, nextRunAt: null, active: 0 }).where(eq(jobs.id, job.id)).run();
    }
  }

  listJobs(): Array<typeof jobs.$inferSelect> {
    return this.db.getDrizzle().select().from(jobs).all();
  }

  activeJobCount(): number {
    const rows = this.db.getDrizzle().select().from(jobs).where(eq(jobs.active, 1)).all();
    return rows.length;
  }
}
