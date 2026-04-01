import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import { BusService } from "../bus/bus.service.js";
import { log } from "../shared/logger.js";

export interface MaintenanceConfig {
  messageTtlDays: number;
  maxMessagesPerChat: number;
  vacuumAfterCleanup: boolean;
}

export interface MaintenanceResult {
  deletedMessages: number;
  deletedEvents: number;
}

@Injectable()
export class SessionMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private static readonly INTERVAL_MS = 24 * 60 * 60 * 1000;
  private readonly config: MaintenanceConfig;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(BusService) private readonly bus: BusService,
    config?: MaintenanceConfig,
  ) {
    this.config = config ?? { messageTtlDays: 30, maxMessagesPerChat: 500, vacuumAfterCleanup: true };
  }

  onModuleInit(): void {
    this.run();
    this.timer = setInterval(() => this.run(), SessionMaintenanceService.INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  run(): MaintenanceResult {
    const raw = this.db.getDb();
    let deletedMessages = 0;
    let deletedEvents = 0;

    const cutoff = Date.now() - this.config.messageTtlDays * 24 * 60 * 60 * 1000;
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
    }

    return { deletedMessages, deletedEvents };
  }
}
