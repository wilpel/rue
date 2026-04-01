import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { DelegateService } from "../agents/delegate.service.js";
import { log } from "../shared/logger.js";
import type { Task } from "../tasks/task.service.js";

export function computeNextRun(schedule: string, fromMs: number): number | null {
  const s = schedule.trim().toLowerCase();
  const inMatch = s.match(/^in\s+(\d+)\s*(m|min|h|hr|hour|s|sec|d|day)$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const ms = unit.startsWith("d") ? amount * 86_400_000 : unit.startsWith("h") ? amount * 3_600_000 : unit.startsWith("s") ? amount * 1_000 : amount * 60_000;
    return fromMs + ms;
  }
  const everyMatch = s.match(/^every\s+(\d+)\s*(m|min|h|hr|hour|s|sec|d|day)$/);
  if (everyMatch) {
    const amount = parseInt(everyMatch[1], 10);
    const unit = everyMatch[2];
    const ms = unit.startsWith("d") ? amount * 86_400_000 : unit.startsWith("h") ? amount * 3_600_000 : unit.startsWith("s") ? amount * 1_000 : amount * 60_000;
    return fromMs + ms;
  }
  return null;
}

function isRecurring(schedule: string): boolean {
  return schedule.trim().toLowerCase().startsWith("every");
}

/**
 * Scheduler polls the `tasks` table for scheduled/reminder tasks that are due.
 * When a task is due (due_at <= now, status = pending, type = scheduled|reminder):
 * - Spawns a delegate to execute the task
 * - For recurring tasks (schedule starts with "every"): updates due_at to next run
 * - For one-shot tasks: marks as completed
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs = 30_000;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(DelegateService) private readonly delegate: DelegateService,
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
    const dueTasks = this.db.getDb().prepare(
      "SELECT * FROM tasks WHERE status = 'pending' AND due_at IS NOT NULL AND due_at <= ? AND type IN ('scheduled', 'reminder')",
    ).all(now) as Task[];

    for (const task of dueTasks) {
      this.executeTask(task, now);
    }
    return dueTasks.length;
  }

  private executeTask(task: Task, now: number): void {
    log.info(`[scheduler] Firing task "${task.title}": ${task.description ?? task.title}`);

    // Spawn delegate to do the actual work
    this.delegate.spawn(task.description ?? task.title, 0, undefined, { name: task.title }).catch(err => {
      log.error(`[scheduler] Task "${task.title}" agent failed: ${err instanceof Error ? err.message : err}`);
    });

    if (task.schedule && isRecurring(task.schedule)) {
      // Recurring: compute next due_at
      const nextDue = computeNextRun(task.schedule, now);
      this.db.getDb().prepare(
        "UPDATE tasks SET due_at = ?, updated_at = ? WHERE id = ?",
      ).run(nextDue, now, task.id);
    } else {
      // One-shot: mark completed
      this.db.getDb().prepare(
        "UPDATE tasks SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
      ).run(now, now, task.id);
    }
  }

  listJobs(): Task[] {
    return this.db.getDb().prepare(
      "SELECT * FROM tasks WHERE type IN ('scheduled', 'reminder') ORDER BY due_at ASC",
    ).all() as Task[];
  }

  activeJobCount(): number {
    return (this.db.getDb().prepare(
      "SELECT COUNT(*) as cnt FROM tasks WHERE type IN ('scheduled', 'reminder') AND status = 'pending'",
    ).get() as { cnt: number }).cnt;
  }
}
