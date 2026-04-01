import { describe, it, expect, vi } from "vitest";
import { DelegatesController } from "../../src/api/delegates.controller.js";
import type { DelegateService } from "../../src/agents/delegate.service.js";

describe("DelegatesController", () => {
  it("lists delegates", () => {
    const mockDelegate = { listDelegates: vi.fn().mockReturnValue([]) } as unknown as DelegateService;
    const controller = new DelegatesController(mockDelegate);
    expect(controller.listDelegates()).toEqual({ agents: [] });
  });

  it("returns error for missing delegate", () => {
    const mockDelegate = { getDelegate: vi.fn().mockReturnValue(undefined) } as unknown as DelegateService;
    const controller = new DelegatesController(mockDelegate);
    expect(controller.getDelegate("nonexistent")).toEqual({ error: "Agent not found" });
  });

  it("validates spawn body", () => {
    const mockDelegate = { spawn: vi.fn() } as unknown as DelegateService;
    const controller = new DelegatesController(mockDelegate);
    const result = controller.spawnDelegate({ task: "" });
    expect(result).toEqual({ error: "task is required" });
  });
});
