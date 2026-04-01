import { describe, it, expect, vi } from "vitest";
import { TasksController } from "../../src/api/tasks.controller.js";
import type { TaskService, Task } from "../../src/tasks/task.service.js";

function makeMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task_abc123",
    title: "Test task",
    status: "pending",
    type: "work",
    priority: "normal",
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

describe("TasksController", () => {
  function createController(taskServiceOverrides: Partial<TaskService> = {}) {
    const mockService = {
      list: vi.fn().mockReturnValue([]),
      listActive: vi.fn().mockReturnValue([]),
      listDue: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue(undefined),
      create: vi.fn().mockReturnValue(makeMockTask()),
      update: vi.fn().mockReturnValue(undefined),
      delete: vi.fn().mockReturnValue(false),
      ...taskServiceOverrides,
    } as unknown as TaskService;
    return { controller: new TasksController(mockService), service: mockService };
  }

  it("lists tasks", () => {
    const task = makeMockTask();
    const { controller } = createController({ list: vi.fn().mockReturnValue([task]) });
    const result = controller.list();
    expect(result.tasks).toHaveLength(1);
  });

  it("lists active tasks", () => {
    const { controller } = createController({ listActive: vi.fn().mockReturnValue([makeMockTask()]) });
    const result = controller.listActive();
    expect(result.tasks).toHaveLength(1);
  });

  it("lists due tasks", () => {
    const { controller } = createController({ listDue: vi.fn().mockReturnValue([]) });
    const result = controller.listDue();
    expect(result.tasks).toHaveLength(0);
  });

  it("gets a task by id", () => {
    const task = makeMockTask();
    const { controller } = createController({ get: vi.fn().mockReturnValue(task) });
    const result = controller.get("task_abc123");
    expect(result).toEqual(task);
  });

  it("returns error for missing task", () => {
    const { controller } = createController();
    const result = controller.get("task_nope") as { error: string };
    expect(result.error).toBe("Task not found");
  });

  it("creates a task", () => {
    const { controller, service } = createController();
    controller.create({ title: "New task" });
    expect(service.create).toHaveBeenCalledWith({ title: "New task" });
  });

  it("returns error when title missing", () => {
    const { controller } = createController();
    const result = controller.create({ title: "" }) as { error: string };
    expect(result.error).toBe("title is required");
  });

  it("updates a task", () => {
    const task = makeMockTask({ status: "active" });
    const { controller } = createController({ update: vi.fn().mockReturnValue(task) });
    const result = controller.update("task_abc123", { status: "active" });
    expect(result).toEqual(task);
  });

  it("returns error when updating missing task", () => {
    const { controller } = createController();
    const result = controller.update("task_nope", { status: "active" }) as { error: string };
    expect(result.error).toBe("Task not found");
  });

  it("deletes a task", () => {
    const { controller } = createController({ delete: vi.fn().mockReturnValue(true) });
    const result = controller.delete("task_abc123");
    expect(result).toEqual({ ok: true });
  });
});
