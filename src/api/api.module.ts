import { Module } from "@nestjs/common";
import { StatusController } from "./status.controller.js";
import { DelegatesController } from "./delegates.controller.js";
import { HistoryController } from "./history.controller.js";
import { SecretsController } from "./secrets.controller.js";
import { ProjectsController } from "./projects.controller.js";
import { CostController } from "./cost.controller.js";
import { AgentsModule } from "../agents/agents.module.js";
import { MemoryModule } from "../memory/memory.module.js";

@Module({
  imports: [AgentsModule, MemoryModule],
  controllers: [StatusController, DelegatesController, HistoryController, SecretsController, ProjectsController, CostController],
})
export class ApiModule {}
