import { describe, it, expect, vi, beforeEach } from "vitest";
import { DelegateService } from "../../src/agents/delegate.service.js";
import { ClaudeProcessService } from "../../src/agents/claude-process.service.js";
import { HealthService } from "../../src/agents/health.service.js";
import { BusService } from "../../src/bus/bus.service.js";
import type { InboxService } from "../../src/inbox/inbox.service.js";

describe("DelegateService", () => {
  let delegate: DelegateService;
  let mockInbox: InboxService;
  let mockHealth: HealthService;
  let bus: BusService;
  let mockProcessService: ClaudeProcessService;

  beforeEach(() => {
    bus = new BusService();
    mockInbox = { push: vi.fn(), onMessage: vi.fn(), formatPrefix: vi.fn() } as unknown as InboxService;
    mockHealth = { trackAgent: vi.fn(), untrackAgent: vi.fn(), updateLastOutput: vi.fn(), start: vi.fn(), stop: vi.fn(), onModuleDestroy: vi.fn() } as unknown as HealthService;

    const mockProcess = {
      run: vi.fn().mockResolvedValue({ output: "Search results here", exitCode: 0, cost: 0.05, durationMs: 5000 }),
      kill: vi.fn(),
      onOutput: vi.fn(),
      isRunning: false,
    };
    mockProcessService = { createProcess: vi.fn().mockReturnValue(mockProcess) } as unknown as ClaudeProcessService;

    delegate = new DelegateService(mockProcessService, bus, mockInbox, mockHealth);
  });

  it("spawns a delegate and pushes result to inbox on completion", async () => {
    await delegate.spawn("Search for apartments", 123, 456);
    expect(mockInbox.push).toHaveBeenCalledWith(
      "delegate",
      expect.stringContaining("Search results here"),
      expect.objectContaining({ chatId: 123 }),
    );
  });

  it("tracks agent in health monitor", async () => {
    await delegate.spawn("Task", 123);
    expect(mockHealth.trackAgent).toHaveBeenCalled();
    expect(mockHealth.untrackAgent).toHaveBeenCalled();
  });

  it("emits bus events on spawn and completion", async () => {
    const spawned = vi.fn();
    const completed = vi.fn();
    bus.on("agent:spawned", spawned);
    bus.on("agent:completed", completed);
    await delegate.spawn("Task", 123);
    expect(spawned).toHaveBeenCalled();
    expect(completed).toHaveBeenCalled();
  });

  it("lists active delegates", async () => {
    // Start a delegate that doesn't resolve immediately
    const neverResolve = { run: () => new Promise(() => {}), kill: vi.fn(), onOutput: vi.fn(), isRunning: true };
    (mockProcessService.createProcess as ReturnType<typeof vi.fn>).mockReturnValue(neverResolve);

    const promise = delegate.spawn("Long task", 123);
    const agents = delegate.listDelegates();
    expect(agents.length).toBe(1);
    expect(agents[0].task).toBe("Long task");
    expect(agents[0].status).toBe("running");

    // Clean up
    neverResolve.kill();
    await promise.catch(() => {});
  });

  it("handles failure and pushes error to inbox", async () => {
    const failProcess = {
      run: vi.fn().mockRejectedValue(new Error("SDK crashed")),
      kill: vi.fn(),
      onOutput: vi.fn(),
      isRunning: false,
    };
    (mockProcessService.createProcess as ReturnType<typeof vi.fn>).mockReturnValue(failProcess);

    await delegate.spawn("Failing task", 123);
    expect(mockInbox.push).toHaveBeenCalledWith(
      "delegate",
      expect.stringContaining("issue"),
      expect.objectContaining({ chatId: 123, error: expect.any(String) }),
    );
  });

  it("gets delegate by id", async () => {
    const neverResolve = { run: () => new Promise(() => {}), kill: vi.fn(), onOutput: vi.fn(), isRunning: true };
    (mockProcessService.createProcess as ReturnType<typeof vi.fn>).mockReturnValue(neverResolve);

    const promise = delegate.spawn("Task", 123);
    const agents = delegate.listDelegates();
    const agent = delegate.getDelegate(agents[0].id);
    expect(agent).toBeDefined();
    expect(agent!.task).toBe("Task");

    neverResolve.kill();
    await promise.catch(() => {});
  });
});
