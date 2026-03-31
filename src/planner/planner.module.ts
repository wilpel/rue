import { Module } from "@nestjs/common";
import { PlannerService } from "./planner.service.js";
import { AgentsModule } from "../agents/agents.module.js";

@Module({
  imports: [AgentsModule],
  providers: [PlannerService],
  exports: [PlannerService],
})
export class PlannerModule {}
