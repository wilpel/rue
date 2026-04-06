import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeartbeatService } from "../../src/scheduler/heartbeat.service.js";
import type { DelegateService } from "../../src/agents/delegate.service.js";
import type { MessageRepository } from "../../src/memory/message.repository.js";
import type { WorkspaceService } from "../../src/memory/workspace.service.js";
import type { TaskService } from "../../src/tasks/task.service.js";
import type { BusService } from "../../src/bus/bus.service.js";
import type { ConfigService } from "../../src/config/config.service.js";

describe("HeartbeatService", () => {
  let heartbeat: HeartbeatService;
  let mockDelegate: DelegateService;
  let mockBus: BusService;

  beforeEach(() => {
    mockDelegate = { spawn: vi.fn().mockResolvedValue(undefined) } as unknown as DelegateService;
    const mockMessages = { compactHistory: vi.fn().mockReturnValue("[USER] hello") } as unknown as MessageRepository;
    const mockWorkspace = { toPromptText: vi.fn().mockReturnValue(""), postSignal: vi.fn() } as unknown as WorkspaceService;
    const mockTasks = { listActive: vi.fn().mockReturnValue([]) } as unknown as TaskService;
    mockBus = { emit: vi.fn() } as unknown as BusService;
    const mockConfig = { heartbeat: { enabled: true, intervalMs: 60_000 } } as unknown as ConfigService;

    heartbeat = new HeartbeatService(mockDelegate, mockMessages, mockWorkspace, mockTasks, mockBus, mockConfig);
  });

  it("spawns a delegate on tick", async () => {
    await heartbeat.tick();
    expect(mockDelegate.spawn).toHaveBeenCalledWith(
      expect.stringContaining("Periodic check-in"),
      0,
      undefined,
      { name: "Heartbeat", complexity: "low" },
    );
  });

  it("emits system:heartbeat event", async () => {
    await heartbeat.tick();
    expect(mockBus.emit).toHaveBeenCalledWith("system:heartbeat", {});
  });

  it("skips if already running", async () => {
    // Make spawn take a while
    (mockDelegate.spawn as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    const first = heartbeat.tick();
    await heartbeat.tick(); // should skip
    await first;
    expect(mockDelegate.spawn).toHaveBeenCalledTimes(1);
  });
});
