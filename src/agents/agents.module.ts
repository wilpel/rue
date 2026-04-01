import { Module } from "@nestjs/common";
import { ClaudeProcessService } from "./claude-process.service.js";
import { LaneQueueService } from "./lane-queue.service.js";
import { SupervisorService } from "./supervisor.service.js";
import { HealthService } from "./health.service.js";
import { DelegateService } from "./delegate.service.js";
import { BudgetService } from "./budget.service.js";

@Module({
  providers: [ClaudeProcessService, LaneQueueService, SupervisorService, HealthService, DelegateService, BudgetService],
  exports: [ClaudeProcessService, LaneQueueService, SupervisorService, HealthService, DelegateService, BudgetService],
})
export class AgentsModule {}
