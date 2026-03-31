import { Module } from "@nestjs/common";
import { ClaudeProcessService } from "./claude-process.service.js";
import { LaneQueueService } from "./lane-queue.service.js";
import { SupervisorService } from "./supervisor.service.js";
import { HealthService } from "./health.service.js";
import { DelegateService } from "./delegate.service.js";

@Module({
  providers: [ClaudeProcessService, LaneQueueService, SupervisorService, HealthService, DelegateService],
  exports: [ClaudeProcessService, LaneQueueService, SupervisorService, HealthService, DelegateService],
})
export class AgentsModule {}
