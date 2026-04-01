import { describe, it, expect, vi, beforeEach } from "vitest";
import { DelegateService } from "../../src/agents/delegate.service.js";
import { ClaudeProcessService } from "../../src/agents/claude-process.service.js";
import { HealthService } from "../../src/agents/health.service.js";
import { BusService } from "../../src/bus/bus.service.js";

describe("DelegateService", () => {
  let delegate: DelegateService;
  let mockHealth: HealthService;
  let bus: BusService;
  let mockProcessService: ClaudeProcessService;

  beforeEach(() => {
    bus = new BusService();
    mockHealth = { trackAgent: vi.fn(), untrackAgent: vi.fn(), updateLastOutput: vi.fn(), start: vi.fn(), stop: vi.fn(), onModuleDestroy: vi.fn() } as unknown as HealthService;

    const mockProcess = {
      run: vi.fn().mockResolvedValue({ output: "Search results here", exitCode: 0, cost: 0.05, durationMs: 5000 }),
      kill: vi.fn(),
      onOutput: vi.fn(),
      isRunning: false,
    };
    mockProcessService = { createProcess: vi.fn().mockReturnValue(mockProcess) } as unknown as ClaudeProcessService;

    delegate = new DelegateService(mockProcessService, bus, mockHealth);
  });

  describe("retry policy", () => {
    it("retries once on failure then succeeds", async () => {
      const failProcess = {
        run: vi.fn().mockRejectedValue(new Error("timeout")),
        kill: vi.fn(),
        onOutput: vi.fn(),
        isRunning: false,
      };
      const successProcess = {
        run: vi.fn().mockResolvedValue({ output: "success", exitCode: 0, cost: 0.05, durationMs: 5000 }),
        kill: vi.fn(),
        onOutput: vi.fn(),
        isRunning: false,
      };
      (mockProcessService.createProcess as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(failProcess)
        .mockReturnValueOnce(successProcess);

      const resultHandler = vi.fn();
      bus.on("delegate:result", resultHandler);

      await delegate.spawn("flaky task", 123, undefined, { maxRetries: 1 });

      expect(mockProcessService.createProcess).toHaveBeenCalledTimes(2);
      expect(resultHandler).toHaveBeenCalledWith(expect.objectContaining({ output: "success" }));
    });

    it("posts failure after exhausting retries", async () => {
      const failProcess = {
        run: vi.fn().mockRejectedValue(new Error("timeout")),
        kill: vi.fn(),
        onOutput: vi.fn(),
        isRunning: false,
      };
      (mockProcessService.createProcess as ReturnType<typeof vi.fn>).mockReturnValue(failProcess);

      const resultHandler = vi.fn();
      bus.on("delegate:result", resultHandler);

      await delegate.spawn("doomed task", 123, undefined, { maxRetries: 1 });

      expect(mockProcessService.createProcess).toHaveBeenCalledTimes(2);
      expect(resultHandler).toHaveBeenCalledWith(expect.objectContaining({ output: expect.stringContaining("Failed") }));
    });

    it("defaults to 0 retries", async () => {
      const failProcess = {
        run: vi.fn().mockRejectedValue(new Error("timeout")),
        kill: vi.fn(),
        onOutput: vi.fn(),
        isRunning: false,
      };
      (mockProcessService.createProcess as ReturnType<typeof vi.fn>).mockReturnValue(failProcess);

      await delegate.spawn("task", 123);

      expect(mockProcessService.createProcess).toHaveBeenCalledTimes(1);
    });
  });

  it("spawns a delegate and emits delegate:result on bus on completion", async () => {
    const resultHandler = vi.fn();
    bus.on("delegate:result", resultHandler);

    await delegate.spawn("Search for apartments", 123, 456);

    expect(resultHandler).toHaveBeenCalledWith({
      agentId: expect.stringContaining("delegate-"),
      output: "Search results here",
      chatId: 123,
    });
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

  it("emits delegate:result with failure on bus on error", async () => {
    const resultHandler = vi.fn();
    bus.on("delegate:result", resultHandler);

    const failProcess = {
      run: vi.fn().mockRejectedValue(new Error("SDK crashed")),
      kill: vi.fn(),
      onOutput: vi.fn(),
      isRunning: false,
    };
    (mockProcessService.createProcess as ReturnType<typeof vi.fn>).mockReturnValue(failProcess);

    await delegate.spawn("Failing task", 123);

    expect(resultHandler).toHaveBeenCalledWith({
      agentId: expect.stringContaining("delegate-"),
      output: "Failed: SDK crashed",
      chatId: 123,
    });
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
