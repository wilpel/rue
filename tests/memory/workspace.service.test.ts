import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceService } from "../../src/memory/workspace.service.js";
import type { BusService } from "../../src/bus/bus.service.js";
import type { ConfigService } from "../../src/config/config.service.js";

describe("WorkspaceService", () => {
  let workspace: WorkspaceService;
  let mockBus: BusService;

  beforeEach(() => {
    mockBus = { emit: vi.fn() } as unknown as BusService;
    const mockConfig = { workspace: { enabled: true, tickMs: 15_000, maxSignals: 5, topN: 3 } } as unknown as ConfigService;
    workspace = new WorkspaceService(mockBus, mockConfig);
  });

  it("posts and retrieves signals", () => {
    workspace.postSignal({ source: "test", type: "msg", content: "hello", salience: 0.5, ttlMs: 300_000 });
    expect(workspace.signalCount).toBe(1);
    const top = workspace.getTopSignals();
    expect(top).toHaveLength(1);
    expect(top[0].content).toBe("hello");
  });

  it("orders by effective salience", () => {
    workspace.postSignal({ source: "a", type: "msg", content: "low", salience: 0.2, ttlMs: 300_000 });
    workspace.postSignal({ source: "b", type: "msg", content: "high", salience: 0.9, ttlMs: 300_000 });
    workspace.postSignal({ source: "c", type: "msg", content: "mid", salience: 0.5, ttlMs: 300_000 });
    const top = workspace.getTopSignals(3);
    expect(top[0].content).toBe("high");
    expect(top[1].content).toBe("mid");
    expect(top[2].content).toBe("low");
  });

  it("evicts lowest salience when over max", () => {
    for (let i = 0; i < 6; i++) {
      workspace.postSignal({ source: "test", type: "msg", content: `sig-${i}`, salience: i * 0.1, ttlMs: 300_000 });
    }
    expect(workspace.signalCount).toBe(5); // maxSignals=5
  });

  it("formats toPromptText correctly", () => {
    workspace.postSignal({ source: "test", type: "msg", content: "hello world", salience: 0.5, ttlMs: 300_000 });
    const text = workspace.toPromptText();
    expect(text).toContain("[test]");
    expect(text).toContain("hello world");
    expect(text).toContain("salience:");
  });

  it("returns empty string when no signals", () => {
    expect(workspace.toPromptText()).toBe("");
  });

  it("clears all signals", () => {
    workspace.postSignal({ source: "test", type: "msg", content: "x", salience: 0.5, ttlMs: 300_000 });
    workspace.clear();
    expect(workspace.signalCount).toBe(0);
  });

  it("serializes and deserializes snapshot", () => {
    workspace.postSignal({ source: "test", type: "msg", content: "snap", salience: 0.5, ttlMs: 300_000 });
    const snap = workspace.toSnapshot();
    workspace.clear();
    workspace.fromSnapshot(snap);
    expect(workspace.signalCount).toBe(1);
  });
});
