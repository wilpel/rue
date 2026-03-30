import { Controller, Get } from "@nestjs/common";
import { SupervisorService } from "../agents/supervisor.service.js";
import { MessageRepository } from "../memory/message.repository.js";
import { BusPersistenceService } from "../bus/bus-persistence.service.js";

@Controller("api")
export class StatusController {
  constructor(
    private readonly supervisor: SupervisorService,
    private readonly messages: MessageRepository,
    private readonly persistence: BusPersistenceService,
  ) {}

  @Get("status")
  getStatus() {
    const agents = this.supervisor.listAgents();
    return {
      status: "running",
      agents: agents.map(a => ({ id: a.id, task: a.config.task, state: a.state, lane: a.config.lane, cost: a.cost })),
    };
  }

  @Get("dashboard")
  getDashboard() {
    const agents = this.supervisor.listAgents();
    const recentMessages = this.messages.recent(10);
    const events = this.persistence.readTail(30);
    return {
      agents: agents.map(a => ({ id: a.id, task: a.config.task, state: a.state, lane: a.config.lane })),
      recentMessages,
      events,
    };
  }
}
