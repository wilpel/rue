import { Module, forwardRef } from "@nestjs/common";
import { InboxService } from "./inbox.service.js";
import { InboxProcessorService } from "./inbox-processor.service.js";
import { MemoryModule } from "../memory/memory.module.js";
import { TelegramModule } from "../telegram/telegram.module.js";

@Module({
  imports: [MemoryModule, forwardRef(() => TelegramModule)],
  providers: [InboxService, InboxProcessorService],
  exports: [InboxService],
})
export class InboxModule {}
