import { Module } from "@nestjs/common";
import { ChannelService } from "./channel.service.js";
import { MemoryModule } from "../memory/memory.module.js";
import { TelegramModule } from "../telegram/telegram.module.js";
import { AgentsModule } from "../agents/agents.module.js";

@Module({
  imports: [MemoryModule, TelegramModule, AgentsModule],
  providers: [ChannelService],
  exports: [ChannelService],
})
export class ChannelModule {}
