import { Module } from "@nestjs/common";
import { DaemonGateway } from "./daemon.gateway.js";
import { AgentsModule } from "../agents/agents.module.js";
import { MemoryModule } from "../memory/memory.module.js";
import { InboxModule } from "../inbox/inbox.module.js";

@Module({
  imports: [AgentsModule, MemoryModule, InboxModule],
  providers: [DaemonGateway],
  exports: [DaemonGateway],
})
export class GatewayModule {}
