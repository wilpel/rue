import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { SupabaseService } from "./supabase.service.js";
import { BusService } from "../bus/bus.service.js";
import { log } from "../shared/logger.js";

export interface MaintenanceConfig {
  messageTtlDays: number;
  maxMessagesPerChat: number;
  vacuumAfterCleanup: boolean;
  preCompactionSave?: boolean;
}

export interface MaintenanceResult {
  deletedMessages: number;
  deletedEvents: number;
}

type DelegateSpawner = { spawn(task: string, chatId: number, messageId?: number, opts?: { name?: string; complexity?: string }): Promise<void> };

@Injectable()
export class SessionMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private static readonly INTERVAL_MS = 24 * 60 * 60 * 1000;
  private readonly config: MaintenanceConfig;
  private delegateSpawner: DelegateSpawner | null = null;

  constructor(
    @Inject(SupabaseService) private readonly db: SupabaseService,
    @Inject(BusService) private readonly bus: BusService,
    config?: MaintenanceConfig,
  ) {
    this.config = config ?? { messageTtlDays: 30, maxMessagesPerChat: 500, vacuumAfterCleanup: true, preCompactionSave: true };
  }

  setDelegateSpawner(spawner: DelegateSpawner): void {
    this.delegateSpawner = spawner;
  }

  onModuleInit(): void {
    this.run().catch(err => log.error(`[maintenance] Initial run failed: ${err instanceof Error ? err.message : err}`));
    this.timer = setInterval(() => this.run().catch(err => log.error(`[maintenance] Scheduled run failed: ${err instanceof Error ? err.message : err}`)), SessionMaintenanceService.INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async run(): Promise<MaintenanceResult> {
    let deletedMessages = 0;
    let deletedEvents = 0;

    const cutoff = Date.now() - this.config.messageTtlDays * 24 * 60 * 60 * 1000;

    // Pre-compaction save
    if (this.config.preCompactionSave && this.delegateSpawner) {
      const { data: expiring } = await this.db.from("messages")
        .select("content, metadata")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(100);

      if (expiring && expiring.length > 0) {
        const preview = expiring.map((m: Record<string, unknown>) => {
          const meta = m.metadata as Record<string, unknown> | null;
          const tag = meta?.tag ?? "MSG";
          return `[${tag}] ${(m.content as string).slice(0, 150)}`;
        }).join("\n");
        const prompt = [
          "PRE-COMPACTION SAVE: These messages are about to be deleted.",
          "Review and save anything important to KB via memory-save skill.",
          "Focus on: decisions, preferences, project context, people.",
          "",
          `${expiring.length} messages expiring:`,
          preview,
        ].join("\n");
        try {
          await this.delegateSpawner.spawn(prompt, 0, undefined, { name: "Pre-compaction save", complexity: "low" });
        } catch (err) {
          log.warn(`[maintenance] Pre-compaction save failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    // Delete old messages
    const { count: msgCount } = await this.db.from("messages")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);
    deletedMessages += msgCount ?? 0;

    // Delete old events
    const { count: evtCount } = await this.db.from("events")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);
    deletedEvents += evtCount ?? 0;

    if (deletedMessages > 0 || deletedEvents > 0) {
      log.info(`[maintenance] Pruned ${deletedMessages} messages, ${deletedEvents} events`);
      this.bus.emit("system:maintenance", { deletedMessages, deletedEvents });
    }

    return { deletedMessages, deletedEvents };
  }
}
