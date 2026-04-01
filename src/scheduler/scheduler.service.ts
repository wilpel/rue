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

    // Mark as active while running
    this.db.getDb().prepare(
      "UPDATE tasks SET status = 'active', agent_id = 'scheduler', updated_at = ? WHERE id = ?",
    ).run(now, task.id);

    // Spawn delegate to do the actual work
    this.delegate.spawn(task.description ?? task.title, 0, undefined, { name: task.title })
      .then(() => {
        const completedAt = Date.now();
        if (task.schedule && isRecurring(task.schedule)) {
          // Recurring: reset to pending with next due_at
          const nextDue = computeNextRun(task.schedule, completedAt);
          this.db.getDb().prepare(
            "UPDATE tasks SET status = 'pending', due_at = ?, agent_id = NULL, updated_at = ? WHERE id = ?",
          ).run(nextDue, completedAt, task.id);
          log.info(`[scheduler] Recurring task "${task.title}" rescheduled for ${nextDue ? new Date(nextDue).toISOString() : "unknown"}`);
        } else {
          // One-shot: mark completed
          this.db.getDb().prepare(
            "UPDATE tasks SET status = 'completed', completed_at = ?, agent_id = NULL, updated_at = ? WHERE id = ?",
          ).run(completedAt, completedAt, task.id);
        }
      })
      .catch(err => {
        const errMsg = err instanceof Error ? err.message : String(err);
        log.error(`[scheduler] Task "${task.title}" failed: ${errMsg}`);
        // Mark as failed, not pending — prevents re-firing
        this.db.getDb().prepare(
          "UPDATE tasks SET status = 'failed', agent_id = NULL, updated_at = ? WHERE id = ?",
        ).run(Date.now(), task.id);
      });
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
