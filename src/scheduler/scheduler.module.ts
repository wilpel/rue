import { Module } from "@nestjs/common";
import { SchedulerService } from "./scheduler.service.js";
import { MemoryModule } from "../memory/memory.module.js";

@Module({
  imports: [MemoryModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
