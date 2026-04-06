import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
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
    @Inject(DatabaseService) private readonly db: DatabaseService,
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
    const raw = this.db.getDb();
    let deletedMessages = 0;
    let deletedEvents = 0;

    const cutoff = Date.now() - this.config.messageTtlDays * 24 * 60 * 60 * 1000;

    // Pre-compaction save: before deleting, let an agent review expiring messages
    if (this.config.preCompactionSave && this.delegateSpawner) {
      const expiring = raw.prepare("SELECT content, metadata FROM messages WHERE created_at < ? ORDER BY created_at DESC LIMIT 100").all(cutoff) as Array<{ content: string; metadata: string | null }>;
      if (expiring.length > 0) {
        const preview = expiring.map(m => {
          const tag = m.metadata ? (JSON.parse(m.metadata) as Record<string, unknown>)?.tag ?? "MSG" : "MSG";
          return `[${tag}] ${m.content.slice(0, 150)}`;
        }).join("\n");
        const prompt = [
          "PRE-COMPACTION SAVE: These messages are about to be deleted from conversation history.",
          "Review them and save anything important to the knowledge base via memory-save skill.",
          "Focus on: decisions made, preferences learned, project context, people mentioned.",
          "If nothing important, just output 'Nothing to save.'",
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

    const ttlResult = raw.prepare("DELETE FROM messages WHERE created_at < ?").run(cutoff);
    deletedMessages += ttlResult.changes;

    const chatIds = raw.prepare(
      "SELECT DISTINCT json_extract(metadata, '$.chatId') as chat_id FROM messages WHERE json_extract(metadata, '$.chatId') IS NOT NULL"
    ).all() as Array<{ chat_id: number }>;

    for (const { chat_id } of chatIds) {
      if (chat_id == null) continue;
      const count = (raw.prepare(
        "SELECT COUNT(*) as cnt FROM messages WHERE json_extract(metadata, '$.chatId') = ?"
      ).get(chat_id) as { cnt: number }).cnt;
      if (count > this.config.maxMessagesPerChat) {
        const excess = count - this.config.maxMessagesPerChat;
        const capResult = raw.prepare(
          "DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE json_extract(metadata, '$.chatId') = ? ORDER BY created_at ASC LIMIT ?)"
        ).run(chat_id, excess);
        deletedMessages += capResult.changes;
      }
    }

    const evtResult = raw.prepare("DELETE FROM events WHERE created_at < ?").run(cutoff);
    deletedEvents += evtResult.changes;

    if (this.config.vacuumAfterCleanup && (deletedMessages > 0 || deletedEvents > 0)) {
      raw.pragma("wal_checkpoint(TRUNCATE)");
    }

    if (deletedMessages > 0 || deletedEvents > 0) {
      log.info(`[maintenance] Pruned ${deletedMessages} messages, ${deletedEvents} events`);
      this.bus.emit("system:maintenance", { deletedMessages, deletedEvents });
    }

    return { deletedMessages, deletedEvents };
  }
}
