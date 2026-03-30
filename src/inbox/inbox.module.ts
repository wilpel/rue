import { Module } from "@nestjs/common";
import { InboxService } from "./inbox.service.js";
import { MemoryModule } from "../memory/memory.module.js";

@Module({
  imports: [MemoryModule],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
