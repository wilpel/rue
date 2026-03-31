import { Module } from "@nestjs/common";
import { DaemonGateway } from "./daemon.gateway.js";
import { AgentsModule } from "../agents/agents.module.js";
import { MemoryModule } from "../memory/memory.module.js";

@Module({
  imports: [AgentsModule, MemoryModule],
  providers: [DaemonGateway],
  exports: [DaemonGateway],
})
export class GatewayModule {}
