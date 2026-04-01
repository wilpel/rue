import { Controller, Get, Post, Param, Body, HttpCode } from "@nestjs/common";
import { DelegateService } from "../agents/delegate.service.js";
import { log } from "../shared/logger.js";

@Controller("api")
export class DelegatesController {
  constructor(private readonly delegate: DelegateService) {}

  @Get("delegates")
  listDelegates() {
    return { agents: this.delegate.listDelegates() };
  }

  @Get("delegates/:id")
  getDelegate(@Param("id") id: string) {
    const agent = this.delegate.getDelegate(id);
    if (!agent) return { error: "Agent not found" };
    return agent;
  }

  @Post("delegate")
  @HttpCode(200)
  spawnDelegate(@Body() body: { task: string; name?: string; chatId: number; messageId?: number }) {
    if (!body.task || !body.chatId) return { error: "task and chatId required" };
    // Fire-and-forget
    this.delegate.spawn(body.task, body.chatId, body.messageId, { name: body.name }).catch(err => log.error(`[delegates] Spawn failed: ${err instanceof Error ? err.message : err}`));
    return { ok: true };
  }
}
