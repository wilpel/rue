import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DatabaseService } from "../../src/database/database.service.js";

describe("DatabaseService", () => {
  let tmpDir: string;
  let dbService: DatabaseService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-db-test-"));
    dbService = new DatabaseService(tmpDir);
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the database file", () => {
    expect(fs.existsSync(path.join(tmpDir, "rue.sqlite"))).toBe(true);
  });

  it("creates all tables", () => {
    const db = dbService.getDb();
    const tables = db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name") as Array<{ name: string }>;
    const names = tables.map(t => t.name).filter(n => !n.startsWith("sqlite_") && !n.startsWith("__"));
    expect(names).toContain("messages");
    expect(names).toContain("facts");
    expect(names).toContain("jobs");
    expect(names).toContain("events");
    expect(names).toContain("telegram_users");
  });

  it("exposes drizzle instance", () => {
    const drizzle = dbService.getDrizzle();
    expect(drizzle).toBeDefined();
  });
});
