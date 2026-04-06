import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceIntegrationService } from "../../src/memory/workspace-integration.service.js";
import { BusService } from "../../src/bus/bus.service.js";
import type { WorkspaceService } from "../../src/memory/workspace.service.js";

describe("WorkspaceIntegrationService", () => {
  let bus: BusService;
  let mockWorkspace: WorkspaceService;

  beforeEach(() => {
    bus = new BusService();
    mockWorkspace = { postSignal: vi.fn() } as unknown as WorkspaceService;
    const integration = new WorkspaceIntegrationService(bus, mockWorkspace);
    integration.onModuleInit();
  });

  it("creates signal for user messages with high salience", () => {
    bus.emit("message:created", { id: "1", role: "user", content: "hello world", timestamp: Date.now() });
    expect(mockWorkspace.postSignal).toHaveBeenCalledWith(expect.objectContaining({
      source: "message:user",
      salience: 0.7,
    }));
  });

  it("creates signal for assistant messages with low salience", () => {
    bus.emit("message:created", { id: "2", role: "assistant", content: "hi", timestamp: Date.now() });
    expect(mockWorkspace.postSignal).toHaveBeenCalledWith(expect.objectContaining({
      source: "message:assistant",
      salience: 0.3,
    }));
  });

  it("creates high-salience signal for agent failures", () => {
    bus.emit("agent:failed", { id: "a1", error: "timeout", retryable: false });
    expect(mockWorkspace.postSignal).toHaveBeenCalledWith(expect.objectContaining({
      type: "agent-failed",
      salience: 0.8,
    }));
  });
});
