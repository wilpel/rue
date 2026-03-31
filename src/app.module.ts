import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { BusModule } from "./bus/bus.module.js";
import { IdentityModule } from "./identity/identity.module.js";
import { MemoryModule } from "./memory/memory.module.js";
import { ChannelModule } from "./channel/channel.module.js";
import { AgentsModule } from "./agents/agents.module.js";
import { GatewayModule } from "./gateway/gateway.module.js";
import { ApiModule } from "./api/api.module.js";
import { TelegramModule } from "./telegram/telegram.module.js";
import { SchedulerModule } from "./scheduler/scheduler.module.js";
import { PlannerModule } from "./planner/planner.module.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    BusModule,
    IdentityModule,
    MemoryModule,
    ChannelModule,
    AgentsModule,
    GatewayModule,
    ApiModule,
    TelegramModule,
    SchedulerModule,
    PlannerModule,
  ],
})
export class AppModule {}
