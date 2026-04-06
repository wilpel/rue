import { Controller, Get, Post, Param, Body, HttpCode, Inject } from "@nestjs/common";
import { DelegateService } from "../agents/delegate.service.js";
import { log } from "../shared/logger.js";

@Controller("api")
export class DelegatesController {
  constructor(@Inject(DelegateService) private readonly delegate: DelegateService) {}

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
  spawnDelegate(@Body() body: { task: string; name?: string; chatId?: number; messageId?: number; complexity?: string }) {
    if (!body.task) return { error: "task is required" };
    const validComplexities = ["trivial", "low", "medium", "hard"] as const;
    const complexity = validComplexities.includes(body.complexity as typeof validComplexities[number])
      ? (body.complexity as typeof validComplexities[number])
      : "medium";
    const chatId = body.chatId ?? 0;
    this.delegate.spawn(body.task, chatId, body.messageId, { name: body.name, complexity }).catch(err => log.error(`[delegates] Spawn failed: ${err instanceof Error ? err.message : err}`));
    return { ok: true, complexity };
  }

  @Post("delegate/:id/ask")
  @HttpCode(200)
  askQuestion(@Param("id") id: string, @Body() body: { question: string }) {
    if (!body.question) return { error: "question is required" };
    this.delegate.postQuestion(id, body.question);
    return { ok: true };
  }

  @Get("delegate/:id/answer")
  getAnswer(@Param("id") id: string) {
    const answer = this.delegate.getAnswer(id);
    if (answer) return { answer };
    return { pending: true };
  }
}
