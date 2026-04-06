import { Global, Module } from "@nestjs/common";
import { SupabaseService } from "./supabase.service.js";
import { SessionMaintenanceService } from "./session-maintenance.service.js";
import { ConfigService } from "../config/config.service.js";
import { BusService } from "../bus/bus.service.js";

@Global()
@Module({
  providers: [
    {
      provide: SupabaseService,
      useFactory: (config: ConfigService) => new SupabaseService(
        config.supabase.url,
        config.supabase.serviceRoleKey,
      ),
      inject: [ConfigService],
    },
    {
      provide: SessionMaintenanceService,
      useFactory: (db: SupabaseService, bus: BusService, config: ConfigService) =>
        new SessionMaintenanceService(db, bus, config.sessions),
      inject: [SupabaseService, BusService, ConfigService],
    },
  ],
  exports: [SupabaseService, SessionMaintenanceService],
})
export class DatabaseModule {}
