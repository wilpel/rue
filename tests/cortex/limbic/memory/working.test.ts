import { describe, it, expect, beforeEach } from "vitest";
import { WorkingMemory } from "../../../../src/cortex/limbic/memory/working.js";

describe("WorkingMemory", () => {
  let memory: WorkingMemory;

  beforeEach(() => {
    memory = new WorkingMemory();
  });

  it("stores and retrieves values", () => {
    memory.set("currentTask", "refactor auth");
    expect(memory.get("currentTask")).toBe("refactor auth");
  });

  it("returns undefined for missing keys", () => {
    expect(memory.get("nonexistent")).toBeUndefined();
  });

  it("overwrites existing values", () => {
    memory.set("status", "running");
    memory.set("status", "done");
    expect(memory.get("status")).toBe("done");
  });

  it("deletes values", () => {
    memory.set("temp", "value");
    memory.delete("temp");
    expect(memory.get("temp")).toBeUndefined();
  });

  it("lists all entries", () => {
    memory.set("a", 1);
    memory.set("b", 2);
    const entries = memory.entries();
    expect(entries).toEqual([["a", 1], ["b", 2]]);
  });

  it("clears all entries", () => {
    memory.set("a", 1);
    memory.set("b", 2);
    memory.clear();
    expect(memory.entries()).toEqual([]);
  });

  it("serializes to JSON snapshot", () => {
    memory.set("task", "refactor");
    memory.set("agents", ["a1", "a2"]);
    const snapshot = memory.toSnapshot();
    expect(JSON.parse(snapshot)).toEqual({ task: "refactor", agents: ["a1", "a2"] });
  });

  it("restores from JSON snapshot", () => {
    const snapshot = JSON.stringify({ task: "refactor", count: 3 });
    memory.fromSnapshot(snapshot);
    expect(memory.get("task")).toBe("refactor");
    expect(memory.get("count")).toBe(3);
  });

  it("generates a text summary for context assembly", () => {
    memory.set("activeTask", "refactor auth module");
    memory.set("agentCount", 3);
    const summary = memory.toPromptText();
    expect(summary).toContain("activeTask");
    expect(summary).toContain("refactor auth module");
    expect(summary).toContain("agentCount");
  });
});
