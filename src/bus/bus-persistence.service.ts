import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { events } from "../database/schema.js";
import { desc } from "drizzle-orm";

export interface PersistedEvent {
  id: number;
  channel: string;
  payload: string;
  createdAt: number;
}

@Injectable()
export class BusPersistenceService {
  constructor(private readonly db: DatabaseService) {}

  append(channel: string, payload: unknown): void {
    this.db.getDrizzle().insert(events).values({
      channel,
      payload: JSON.stringify(payload),
      createdAt: Date.now(),
    }).run();
  }

  readTail(count: number): PersistedEvent[] {
    const rows = this.db.getDrizzle()
      .select()
      .from(events)
      .orderBy(desc(events.id))
      .limit(count)
      .all();
    return rows.reverse() as PersistedEvent[];
  }
}
