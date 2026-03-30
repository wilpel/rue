import { describe, it, expect } from "vitest";
import { WorkingMemoryService } from "../../src/memory/working-memory.service.js";

describe("WorkingMemoryService", () => {
  it("stores and retrieves values", () => {
    const wm = new WorkingMemoryService();
    wm.set("key", "value");
    expect(wm.get("key")).toBe("value");
  });

  it("snapshots and restores", () => {
    const wm1 = new WorkingMemoryService();
    wm1.set("a", 1); wm1.set("b", "two");
    const snapshot = wm1.toSnapshot();
    const wm2 = new WorkingMemoryService();
    wm2.fromSnapshot(snapshot);
    expect(wm2.get("a")).toBe(1);
    expect(wm2.get("b")).toBe("two");
  });

  it("generates prompt text", () => {
    const wm = new WorkingMemoryService();
    wm.set("task", "research apartments");
    expect(wm.toPromptText()).toContain("research apartments");
  });

  it("returns empty text when no state", () => {
    const wm = new WorkingMemoryService();
    expect(wm.toPromptText()).toContain("No active");
  });
});
