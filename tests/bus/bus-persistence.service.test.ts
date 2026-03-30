import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DatabaseService } from "../../src/database/database.service.js";
import { BusPersistenceService } from "../../src/bus/bus-persistence.service.js";

describe("BusPersistenceService", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let persistence: BusPersistenceService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-buspers-test-"));
    dbService = new DatabaseService(tmpDir);
    persistence = new BusPersistenceService(dbService);
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends events to database", () => {
    persistence.append("agent:spawned", { id: "a1", task: "test", lane: "sub" });
    persistence.append("agent:completed", { id: "a1", result: "done", cost: 0 });
    const events = persistence.readTail(10);
    expect(events).toHaveLength(2);
    expect(events[0].channel).toBe("agent:spawned");
    expect(events[1].channel).toBe("agent:completed");
  });

  it("readTail returns last N events", () => {
    for (let i = 0; i < 10; i++) {
      persistence.append("agent:progress", { id: `a${i}`, chunk: `chunk-${i}` });
    }
    const tail = persistence.readTail(3);
    expect(tail).toHaveLength(3);
    expect(JSON.parse(tail[0].payload as string).id).toBe("a7");
  });
});
