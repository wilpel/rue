import { Module } from "@nestjs/common";
import { ClaudeProcessService } from "./claude-process.service.js";
import { LaneQueueService } from "./lane-queue.service.js";
import { SupervisorService } from "./supervisor.service.js";
import { HealthService } from "./health.service.js";

@Module({
  providers: [ClaudeProcessService, LaneQueueService, SupervisorService, HealthService],
  exports: [ClaudeProcessService, LaneQueueService, SupervisorService, HealthService],
})
export class AgentsModule {}
