import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventPersistence, type PersistedEvent } from "../../src/bus/persistence.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("EventPersistence", () => {
  let tmpDir: string;
  let persistence: EventPersistence;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-bus-test-"));
    persistence = new EventPersistence(tmpDir);
  });

  afterEach(() => {
    persistence.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends events and reads them back", () => {
    persistence.append("agent:spawned", { id: "a1", task: "test", lane: "sub" });
    persistence.append("agent:completed", { id: "a1", result: "done", cost: 0.1 });
    const events = persistence.readAll();
    expect(events).toHaveLength(2);
    expect(events[0].channel).toBe("agent:spawned");
    expect(events[0].payload).toEqual({ id: "a1", task: "test", lane: "sub" });
    expect(events[1].channel).toBe("agent:completed");
  });

  it("assigns sequential IDs and timestamps", () => {
    persistence.append("system:started", {});
    persistence.append("system:shutdown", { reason: "test" });
    const events = persistence.readAll();
    expect(events[0].seq).toBe(1);
    expect(events[1].seq).toBe(2);
    expect(events[0].ts).toBeTypeOf("number");
    expect(events[1].ts).toBeGreaterThanOrEqual(events[0].ts);
  });

  it("persists across instances", () => {
    persistence.append("system:started", {});
    persistence.close();
    const p2 = new EventPersistence(tmpDir);
    const events = p2.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].channel).toBe("system:started");
    p2.close();
  });

  it("reads tail of events", () => {
    for (let i = 0; i < 10; i++) {
      persistence.append("system:health", { agents: i, queueDepth: 0, memoryMb: 0 });
    }
    const tail = persistence.readTail(3);
    expect(tail).toHaveLength(3);
    expect(tail[0].seq).toBe(8);
    expect(tail[2].seq).toBe(10);
  });

  it("reads events since a given sequence number", () => {
    for (let i = 0; i < 5; i++) {
      persistence.append("system:health", { agents: i, queueDepth: 0, memoryMb: 0 });
    }
    const since = persistence.readSince(3);
    expect(since).toHaveLength(3);
    expect(since[0].seq).toBe(3);
  });

  it("returns empty array when no events", () => {
    expect(persistence.readAll()).toEqual([]);
    expect(persistence.readTail(5)).toEqual([]);
  });
});
