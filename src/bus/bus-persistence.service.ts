import { Injectable, Inject } from "@nestjs/common";
import { SupabaseService } from "../database/supabase.service.js";

export interface PersistedEvent {
  id: number;
  channel: string;
  payload: string;
  createdAt: number;
}

@Injectable()
export class BusPersistenceService {
  constructor(@Inject(SupabaseService) private readonly db: SupabaseService) {}

  async append(channel: string, payload: unknown): Promise<void> {
    await this.db.from("events").insert({
      channel,
      payload,
      created_at: Date.now(),
    });
  }

  async readTail(count: number): Promise<PersistedEvent[]> {
    const { data } = await this.db.from("events")
      .select("*")
      .order("id", { ascending: false })
      .limit(count);
    return ((data ?? []) as unknown as PersistedEvent[]).reverse();
  }
}
