import { Global, Module } from "@nestjs/common";
import { BusService } from "./bus.service.js";
import { BusPersistenceService } from "./bus-persistence.service.js";

@Global()
@Module({
  providers: [BusService, BusPersistenceService],
  exports: [BusService, BusPersistenceService],
})
export class BusModule {}
