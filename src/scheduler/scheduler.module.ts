import { Module } from "@nestjs/common";
import { SchedulerService } from "./scheduler.service.js";
import { AgentsModule } from "../agents/agents.module.js";
import { InboxModule } from "../inbox/inbox.module.js";

@Module({
  imports: [AgentsModule, InboxModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
