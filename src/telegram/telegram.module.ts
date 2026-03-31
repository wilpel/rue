import { Module } from "@nestjs/common";
import { TelegramService } from "./telegram.service.js";
import { TelegramStoreService } from "./telegram-store.service.js";
import { ConfigService } from "../config/config.service.js";

@Module({
  providers: [
    TelegramService,
    { provide: TelegramStoreService, useFactory: (config: ConfigService) => new TelegramStoreService(config.dataDir), inject: [ConfigService] },
  ],
  exports: [TelegramService, TelegramStoreService],
})
export class TelegramModule {}
