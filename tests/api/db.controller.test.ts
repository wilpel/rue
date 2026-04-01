import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DbController } from "../../src/api/db.controller.js";
import { DatabaseService } from "../../src/database/database.service.js";

describe("DbController", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let controller: DbController;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-db-ctrl-test-"));
    dbService = new DatabaseService(tmpDir);
    controller = new DbController(dbService);
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("executes a write statement", () => {
    const result = controller.exec({
      sql: "CREATE TABLE IF NOT EXISTS test_table (id TEXT PRIMARY KEY, name TEXT)",
    });
    expect(result).toEqual({ ok: true, changes: 0 });
  });

  it("executes an insert with params", () => {
    controller.exec({ sql: "CREATE TABLE test_t (id TEXT, val TEXT)" });
    const result = controller.exec({
      sql: "INSERT INTO test_t (id, val) VALUES (?, ?)",
      params: ["a", "hello"],
    });
    expect(result).toEqual({ ok: true, changes: 1 });
  });

  it("queries rows", () => {
    controller.exec({ sql: "CREATE TABLE test_q (id TEXT, val TEXT)" });
    controller.exec({ sql: "INSERT INTO test_q VALUES ('a', 'one')" });
    controller.exec({ sql: "INSERT INTO test_q VALUES ('b', 'two')" });

    const result = controller.query({ sql: "SELECT * FROM test_q ORDER BY id" }) as { rows: unknown[] };
    expect(result.rows).toHaveLength(2);
  });

  it("returns error for invalid SQL in exec", () => {
    const result = controller.exec({ sql: "INVALID SQL" }) as { error: string };
    expect(result.error).toBeDefined();
  });

  it("returns error for invalid SQL in query", () => {
    const result = controller.query({ sql: "SELECT * FROM nonexistent" }) as { error: string };
    expect(result.error).toBeDefined();
  });

  it("returns error when sql is missing", () => {
    const result = controller.exec({ sql: "" }) as { error: string };
    expect(result.error).toBe("sql is required");
  });
});
