import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { SupabaseService } from "../database/supabase.service.js";
import { BusService } from "../bus/bus.service.js";
import { MessageRepository } from "../memory/message.repository.js";
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

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs = 30_000;

  constructor(
    @Inject(SupabaseService) private readonly db: SupabaseService,
    @Inject(BusService) private readonly bus: BusService,
    @Inject(MessageRepository) private readonly messages: MessageRepository,
  ) {}

  onModuleInit(): void { this.start(); }
  onModuleDestroy(): void { this.stop(); }

  start(): void {
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    this.tick();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async tick(): Promise<number> {
    const now = Date.now();
    const { data: dueTasks } = await this.db.from("tasks")
      .select("*")
      .eq("status", "pending")
      .not("due_at", "is", null)
      .lte("due_at", now)
      .in("type", ["scheduled", "reminder"]);

    const tasks = (dueTasks ?? []) as unknown as Task[];
    for (const task of tasks) {
      await this.executeTask(task, now);
    }
    return tasks.length;
  }

  private async executeTask(task: Task, now: number): Promise<void> {
    log.info(`[scheduler] Firing task "${task.title}": ${task.description ?? task.title}`);

    const content = `[SCHEDULED EVENT TRIGGERED] ${task.title}${task.description ? `: ${task.description}` : ""}`;
    await this.messages.append({
      role: "channel", content,
      metadata: { tag: "SYSTEM_SCHEDULER", taskId: task.id },
    });

    this.bus.emit("task:updated", { id: task.id, nodeId: task.id, status: "triggered" });

    if (task.schedule && isRecurring(task.schedule)) {
      const nextDue = computeNextRun(task.schedule, now);
      await this.db.from("tasks").update({ due_at: nextDue, updated_at: now }).eq("id", task.id);
      log.info(`[scheduler] Recurring task "${task.title}" rescheduled for ${nextDue ? new Date(nextDue).toISOString() : "unknown"}`);
    } else {
      await this.db.from("tasks").update({ status: "completed", completed_at: now, updated_at: now }).eq("id", task.id);
    }
  }

  async listJobs(): Promise<Task[]> {
    const { data } = await this.db.from("tasks")
      .select("*")
      .in("type", ["scheduled", "reminder"])
      .order("due_at", { ascending: true });
    return (data ?? []) as unknown as Task[];
  }

  async activeJobCount(): Promise<number> {
    const { count } = await this.db.from("tasks")
      .select("*", { count: "exact", head: true })
      .in("type", ["scheduled", "reminder"])
      .eq("status", "pending");
    return count ?? 0;
  }
}
