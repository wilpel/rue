import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseService implements OnModuleDestroy {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey);
  }

  /** Get the Supabase client for direct queries */
  getClient(): SupabaseClient {
    return this.client;
  }

  /** Shorthand: supabase.from(table) */
  from(table: string) {
    return this.client.from(table);
  }

  onModuleDestroy(): void {
    // Supabase JS client doesn't need explicit cleanup
  }
}
