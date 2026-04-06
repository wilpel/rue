import { Controller, Post, Body, HttpCode, Inject } from "@nestjs/common";
import { SupabaseService } from "../database/supabase.service.js";
import { log } from "../shared/logger.js";

@Controller("api/db")
export class DbController {
  constructor(@Inject(SupabaseService) private readonly db: SupabaseService) {}

  @Post("query")
  @HttpCode(200)
  async query(@Body() body: { table: string; select?: string; filters?: Record<string, unknown>; limit?: number }) {
    if (!body.table) return { error: "table is required" };
    try {
      let query = this.db.from(body.table).select(body.select ?? "*");
      if (body.filters) {
        for (const [key, value] of Object.entries(body.filters)) {
          query = query.eq(key, value);
        }
      }
      if (body.limit) query = query.limit(body.limit);
      const { data, error } = await query;
      if (error) return { error: error.message };
      return { rows: data };
    } catch (err) {
      log.error(`[db] query error: ${err instanceof Error ? err.message : String(err)}`);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  @Post("exec")
  @HttpCode(200)
  async exec(@Body() body: { table: string; operation: "insert" | "update" | "delete"; data?: Record<string, unknown>; filters?: Record<string, unknown> }) {
    if (!body.table || !body.operation) return { error: "table and operation are required" };
    try {
      if (body.operation === "insert" && body.data) {
        const { error } = await this.db.from(body.table).insert(body.data);
        if (error) return { error: error.message };
        return { ok: true };
      } else if (body.operation === "update" && body.data && body.filters) {
        let query = this.db.from(body.table).update(body.data);
        for (const [key, value] of Object.entries(body.filters)) query = query.eq(key, value);
        const { error } = await query;
        if (error) return { error: error.message };
        return { ok: true };
      } else if (body.operation === "delete" && body.filters) {
        let query = this.db.from(body.table).delete();
        for (const [key, value] of Object.entries(body.filters)) query = query.eq(key, value);
        const { error } = await query;
        if (error) return { error: error.message };
        return { ok: true };
      }
      return { error: "invalid operation or missing data/filters" };
    } catch (err) {
      log.error(`[db] exec error: ${err instanceof Error ? err.message : String(err)}`);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}
