import { Injectable, Inject } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { BusService } from "../bus/bus.service.js";
import { nanoid } from "nanoid";
import { log } from "../shared/logger.js";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  type: string;
  priority: string;
  agent_id?: string;
  due_at?: number;
  schedule?: string;
  created_at: number;
  updated_at: number;
  completed_at?: number;
}

@Injectable()
export class TaskService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(BusService) private readonly bus: BusService,
  ) {}

  create(opts: { title: string; description?: string; type?: string; priority?: string; dueAt?: number; schedule?: string }): Task {
    const id = `task_${nanoid(12)}`;
    const now = Date.now();
    const task: Task = {
      id,
      title: opts.title,
      description: opts.description,
      status: "pending",
      type: opts.type ?? "work",
      priority: opts.priority ?? "normal",
      due_at: opts.dueAt,
      schedule: opts.schedule,
      created_at: now,
      updated_at: now,
    };

    this.db.getDb().prepare(
      "INSERT INTO tasks (id, title, description, status, type, priority, due_at, schedule, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(task.id, task.title, task.description ?? null, task.status, task.type, task.priority, task.due_at ?? null, task.schedule ?? null, task.created_at, task.updated_at);

    this.bus.emit("task:created", { id, goal: task.title, nodeCount: 1 });
    log.info(`[tasks] Created: ${task.title} (${task.type})`);
    return task;
  }

  update(id: string, fields: Partial<Pick<Task, "status" | "title" | "description" | "priority" | "agent_id" | "due_at">>): Task | undefined {
    const task = this.get(id);
    if (!task) return undefined;

    const updates: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) return task;

    updates.push("updated_at = ?");
    values.push(Date.now());

    if (fields.status === "completed") {
      updates.push("completed_at = ?");
      values.push(Date.now());
    }

    values.push(id);
    this.db.getDb().prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    this.bus.emit("task:updated", { id, nodeId: id, status: fields.status ?? task.status });
    return this.get(id);
  }

  get(id: string): Task | undefined {
    const row = this.db.getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
    return row ?? undefined;
  }

  list(filter?: { status?: string; type?: string }): Task[] {
    let sql = "SELECT * FROM tasks";
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter?.status) { conditions.push("status = ?"); values.push(filter.status); }
    if (filter?.type) { conditions.push("type = ?"); values.push(filter.type); }

    if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, created_at DESC";

    return this.db.getDb().prepare(sql).all(...values) as Task[];
  }

  listActive(): Task[] {
    return this.db.getDb().prepare(
      "SELECT * FROM tasks WHERE status IN ('pending', 'active') ORDER BY CASE WHEN due_at IS NOT NULL THEN due_at ELSE 9999999999999 END ASC, created_at DESC",
    ).all() as Task[];
  }

  listDue(): Task[] {
    const now = Date.now();
    return this.db.getDb().prepare(
      "SELECT * FROM tasks WHERE status = 'pending' AND due_at IS NOT NULL AND due_at <= ? ORDER BY due_at ASC",
    ).all(now) as Task[];
  }

  delete(id: string): boolean {
    const result = this.db.getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return result.changes > 0;
  }
}
