import { Injectable, Inject } from "@nestjs/common";
import { SupabaseService } from "../database/supabase.service.js";
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
    @Inject(SupabaseService) private readonly db: SupabaseService,
    @Inject(BusService) private readonly bus: BusService,
  ) {}

  async create(opts: { title: string; description?: string; type?: string; priority?: string; dueAt?: number; schedule?: string }): Promise<Task> {
    const id = `task_${nanoid(12)}`;
    const now = Date.now();
    const task: Task = {
      id, title: opts.title, description: opts.description,
      status: "pending", type: opts.type ?? "work", priority: opts.priority ?? "normal",
      due_at: opts.dueAt, schedule: opts.schedule, created_at: now, updated_at: now,
    };

    await this.db.from("tasks").insert(task);
    this.bus.emit("task:created", { id, goal: task.title, nodeCount: 1 });
    log.info(`[tasks] Created: ${task.title} (${task.type})`);
    return task;
  }

  async update(id: string, fields: Partial<Pick<Task, "status" | "title" | "description" | "priority" | "agent_id" | "due_at">>): Promise<Task | undefined> {
    const task = await this.get(id);
    if (!task) return undefined;

    const updates: Record<string, unknown> = { ...fields, updated_at: Date.now() };
    if (fields.status === "completed") updates.completed_at = Date.now();

    await this.db.from("tasks").update(updates).eq("id", id);
    this.bus.emit("task:updated", { id, nodeId: id, status: fields.status ?? task.status });
    return this.get(id);
  }

  async get(id: string): Promise<Task | undefined> {
    const { data } = await this.db.from("tasks").select("*").eq("id", id).single();
    return data ? (data as unknown as Task) : undefined;
  }

  async list(filter?: { status?: string; type?: string }): Promise<Task[]> {
    let query = this.db.from("tasks").select("*");
    if (filter?.status) query = query.eq("status", filter.status);
    if (filter?.type) query = query.eq("type", filter.type);
    const { data } = await query.order("created_at", { ascending: false });
    return (data ?? []) as unknown as Task[];
  }

  async listActive(): Promise<Task[]> {
    const { data } = await this.db.from("tasks")
      .select("*")
      .in("status", ["pending", "active"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    return (data ?? []) as unknown as Task[];
  }

  async listDue(): Promise<Task[]> {
    const now = Date.now();
    const { data } = await this.db.from("tasks")
      .select("*")
      .eq("status", "pending")
      .not("due_at", "is", null)
      .lte("due_at", now)
      .order("due_at", { ascending: true });
    return (data ?? []) as unknown as Task[];
  }

  async delete(id: string): Promise<boolean> {
    const { count } = await this.db.from("tasks").delete({ count: "exact" }).eq("id", id);
    return (count ?? 0) > 0;
  }
}
