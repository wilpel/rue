import { Controller, Post, Body, HttpCode, Inject } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { log } from "../shared/logger.js";

@Controller("api/db")
export class DbController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Post("exec")
  @HttpCode(200)
  exec(@Body() body: { sql: string; params?: unknown[] }) {
    if (!body.sql) return { error: "sql is required" };
    try {
      const result = this.db.getDb().prepare(body.sql).run(...(body.params ?? []));
      return { ok: true, changes: result.changes };
    } catch (err) {
      log.error(`[db] exec error: ${err instanceof Error ? err.message : String(err)}`);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  @Post("query")
  @HttpCode(200)
  query(@Body() body: { sql: string; params?: unknown[] }) {
    if (!body.sql) return { error: "sql is required" };
    try {
      const rows = this.db.getDb().prepare(body.sql).all(...(body.params ?? []));
      return { rows };
    } catch (err) {
      log.error(`[db] query error: ${err instanceof Error ? err.message : String(err)}`);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}
