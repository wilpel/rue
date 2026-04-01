import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TaskService } from "../../src/tasks/task.service.js";
import { DatabaseService } from "../../src/database/database.service.js";
import type { BusService } from "../../src/bus/bus.service.js";

describe("TaskService", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let taskService: TaskService;
  let mockBus: BusService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-task-test-"));
    dbService = new DatabaseService(tmpDir);
    mockBus = { emit: vi.fn(), on: vi.fn(), onWildcard: vi.fn() } as unknown as BusService;
    taskService = new TaskService(dbService, mockBus);
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a task with defaults", () => {
    const task = taskService.create({ title: "Test task" });
    expect(task.id).toMatch(/^task_/);
    expect(task.title).toBe("Test task");
    expect(task.status).toBe("pending");
    expect(task.type).toBe("work");
    expect(task.priority).toBe("normal");
    expect(task.created_at).toBeGreaterThan(0);
    expect(mockBus.emit).toHaveBeenCalledWith("task:created", expect.objectContaining({ id: task.id }));
  });

  it("creates a task with custom fields", () => {
    const task = taskService.create({
      title: "Urgent work",
      type: "scheduled",
      priority: "urgent",
      dueAt: 1234567890,
      schedule: "every 1h",
    });
    expect(task.type).toBe("scheduled");
    expect(task.priority).toBe("urgent");
    expect(task.due_at).toBe(1234567890);
    expect(task.schedule).toBe("every 1h");
  });

  it("gets a task by id", () => {
    const created = taskService.create({ title: "Find me" });
    const found = taskService.get(created.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe("Find me");
  });

  it("returns undefined for missing task", () => {
    expect(taskService.get("task_nonexistent")).toBeUndefined();
  });

  it("updates task status", () => {
    const task = taskService.create({ title: "Update me" });
    const updated = taskService.update(task.id, { status: "active" });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe("active");
    expect(mockBus.emit).toHaveBeenCalledWith("task:updated", expect.objectContaining({ id: task.id, status: "active" }));
  });

  it("sets completedAt when completing", () => {
    const task = taskService.create({ title: "Complete me" });
    const updated = taskService.update(task.id, { status: "completed" });
    expect(updated).toBeDefined();
    expect(updated!.completed_at).toBeGreaterThan(0);
  });

  it("returns undefined when updating non-existent task", () => {
    expect(taskService.update("task_nope", { status: "active" })).toBeUndefined();
  });

  it("lists tasks with priority ordering", () => {
    taskService.create({ title: "Low", priority: "low" });
    taskService.create({ title: "Urgent", priority: "urgent" });
    taskService.create({ title: "Normal" });

    const all = taskService.list();
    expect(all).toHaveLength(3);
    expect(all[0].title).toBe("Urgent");
    expect(all[2].title).toBe("Low");
  });

  it("lists tasks filtered by status", () => {
    taskService.create({ title: "Pending" });
    const t2 = taskService.create({ title: "Active" });
    taskService.update(t2.id, { status: "active" });

    const pending = taskService.list({ status: "pending" });
    expect(pending).toHaveLength(1);
    expect(pending[0].title).toBe("Pending");
  });

  it("lists tasks filtered by type", () => {
    taskService.create({ title: "Work", type: "work" });
    taskService.create({ title: "Reminder", type: "reminder" });

    const reminders = taskService.list({ type: "reminder" });
    expect(reminders).toHaveLength(1);
    expect(reminders[0].title).toBe("Reminder");
  });

  it("lists active tasks", () => {
    taskService.create({ title: "Active task" });
    const completed = taskService.create({ title: "Done task" });
    taskService.update(completed.id, { status: "completed" });

    const active = taskService.listActive();
    expect(active).toHaveLength(1);
    expect(active[0].title).toBe("Active task");
  });

  it("lists due tasks", () => {
    const past = Date.now() - 10_000;
    const future = Date.now() + 3_600_000;
    taskService.create({ title: "Due now", dueAt: past });
    taskService.create({ title: "Due later", dueAt: future });
    taskService.create({ title: "No due" });

    const due = taskService.listDue();
    expect(due).toHaveLength(1);
    expect(due[0].title).toBe("Due now");
  });

  it("deletes a task", () => {
    const task = taskService.create({ title: "Delete me" });
    expect(taskService.delete(task.id)).toBe(true);
    expect(taskService.get(task.id)).toBeUndefined();
  });

  it("returns false when deleting non-existent task", () => {
    expect(taskService.delete("task_nope")).toBe(false);
  });
});
