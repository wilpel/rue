import { Module } from "@nestjs/common";
import { SchedulerService } from "./scheduler.service.js";
import { AgentsModule } from "../agents/agents.module.js";

@Module({
  imports: [AgentsModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
