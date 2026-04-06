import { Module, OnModuleInit, OnModuleDestroy, Inject } from "@nestjs/common";
import { ChannelRegistry } from "./channel-registry.js";
import { DebounceService } from "./debounce.service.js";
import { ChannelService } from "./channel.service.js";
import { TelegramAdapter } from "./adapters/telegram.adapter.js";
import { TelegramStoreService } from "./adapters/telegram-store.service.js";
import { CliAdapter } from "./adapters/cli.adapter.js";
import { RouterService } from "../routing/router.service.js";
import { ConfigService } from "../config/config.service.js";
import { SupabaseService } from "../database/supabase.service.js";
import { MemoryModule } from "../memory/memory.module.js";
import { AgentsModule } from "../agents/agents.module.js";

@Module({
  imports: [MemoryModule, AgentsModule],
  providers: [
    ChannelRegistry,
    ChannelService,
    {
      provide: DebounceService,
      useFactory: (config: ConfigService) => new DebounceService(config.debounce),
      inject: [ConfigService],
    },
    {
      provide: TelegramStoreService,
      useFactory: (db: SupabaseService) => new TelegramStoreService(db),
      inject: [SupabaseService],
    },
    {
      provide: TelegramAdapter,
      useFactory: (store: TelegramStoreService) => new TelegramAdapter(store),
      inject: [TelegramStoreService],
    },
    {
      provide: CliAdapter,
      useFactory: () => new CliAdapter(),
    },
    {
      provide: RouterService,
      useFactory: (config: ConfigService) =>
        new RouterService(config.routes, config.agents as Record<string, import("../routing/router.service.js").AgentDef>),
      inject: [ConfigService],
    },
  ],
  exports: [ChannelRegistry, ChannelService, DebounceService, TelegramStoreService, CliAdapter],
})
export class ChannelsModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(ChannelRegistry) private readonly registry: ChannelRegistry,
    @Inject(TelegramAdapter) private readonly telegram: TelegramAdapter,
    @Inject(CliAdapter) private readonly cli: CliAdapter,
    @Inject(DebounceService) private readonly debounce: DebounceService,
    @Inject(ChannelService) private readonly channelService: ChannelService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registry.register(this.telegram);
    this.registry.register(this.cli);
    this.registry.onMessage((msg) => this.debounce.push(msg));
    this.debounce.onBatch((batch) => this.channelService.handleBatch(batch));
    await this.registry.startAll();
  }

  async onModuleDestroy(): Promise<void> {
    await this.registry.stopAll();
  }
}
