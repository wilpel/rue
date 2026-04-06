import { Module } from "@nestjs/common";
import { SchedulerService } from "./scheduler.service.js";
import { HeartbeatService } from "./heartbeat.service.js";
import { ConsolidationService } from "../memory/consolidation.service.js";
import { MemoryModule } from "../memory/memory.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AgentsModule } from "../agents/agents.module.js";
import { TasksModule } from "../tasks/tasks.module.js";

@Module({
  imports: [MemoryModule, IdentityModule, AgentsModule, TasksModule],
  providers: [SchedulerService, HeartbeatService, ConsolidationService],
  exports: [SchedulerService, HeartbeatService, ConsolidationService],
})
export class SchedulerModule {}
