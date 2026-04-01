import { Controller, Get, Post, Param, Body, Query, Delete, HttpCode, Inject } from "@nestjs/common";
import { TaskService } from "../tasks/task.service.js";

@Controller("api/tasks")
export class TasksController {
  constructor(@Inject(TaskService) private readonly tasks: TaskService) {}

  @Get()
  list(@Query("status") status?: string, @Query("type") type?: string) {
    return { tasks: this.tasks.list({ status, type }) };
  }

  @Get("active")
  listActive() {
    return { tasks: this.tasks.listActive() };
  }

  @Get("due")
  listDue() {
    return { tasks: this.tasks.listDue() };
  }

  @Get(":id")
  get(@Param("id") id: string) {
    const task = this.tasks.get(id);
    if (!task) return { error: "Task not found" };
    return task;
  }

  @Post()
  @HttpCode(200)
  create(@Body() body: { title: string; description?: string; type?: string; priority?: string; dueAt?: number; schedule?: string }) {
    if (!body.title) return { error: "title is required" };
    return this.tasks.create(body);
  }

  @Post(":id")
  @HttpCode(200)
  update(@Param("id") id: string, @Body() body: { status?: string; title?: string; description?: string; priority?: string; agent_id?: string; due_at?: number }) {
    const task = this.tasks.update(id, body);
    if (!task) return { error: "Task not found" };
    return task;
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return { ok: this.tasks.delete(id) };
  }
}
