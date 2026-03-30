import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { BusModule } from "./bus/bus.module.js";
import { IdentityModule } from "./identity/identity.module.js";
import { MemoryModule } from "./memory/memory.module.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    BusModule,
    IdentityModule,
    MemoryModule,
  ],
})
export class AppModule {}
