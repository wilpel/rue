import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SupervisorService } from "../../src/agents/supervisor.service.js";
import { BusService } from "../../src/bus/bus.service.js";
import { LaneQueueService } from "../../src/agents/lane-queue.service.js";
import { ClaudeProcessService } from "../../src/agents/claude-process.service.js";
import { ConfigService } from "../../src/config/config.service.js";

function makeMockProcess(task: string) {
  return {
    pid: 99999,
    isRunning: false,
    onOutput: vi.fn(),
    run: vi.fn().mockResolvedValue({
      output: `completed: ${task}`,
      exitCode: 0,
      cost: 0.05,
      durationMs: 100,
    }),
    kill: vi.fn(),
    sendInput: vi.fn(),
  };
}

function makeConfig(maxAgents = 8): ConfigService {
  return {
    maxAgents,
    lanes: { main: 1, sub: 2, cron: 1, skill: 1 },
  } as unknown as ConfigService;
}

describe("SupervisorService", () => {
  let supervisor: SupervisorService;
  let bus: BusService;
  let lanes: LaneQueueService;
  let processService: ClaudeProcessService;

  beforeEach(() => {
    bus = new BusService();
    lanes = new LaneQueueService(makeConfig());
    processService = new ClaudeProcessService();
  });

  afterEach(() => {
    supervisor.shutdown();
  });

  function makeSupervisor(maxAgents = 8): SupervisorService {
    return new SupervisorService(bus, lanes, processService, makeConfig(maxAgents));
  }

  it("spawns an agent and emits agent:spawned", async () => {
    vi.spyOn(processService, "createProcess").mockReturnValue(makeMockProcess("write tests") as never);
    supervisor = makeSupervisor();

    const spawned = vi.fn();
    bus.on("agent:spawned", spawned);

    const result = await supervisor.spawn({
      task: "write tests",
      lane: "sub",
      workdir: "/tmp",
      systemPrompt: "test",
      timeout: 5000,
    });

    expect(result.output).toContain("completed: write tests");
    expect(spawned).toHaveBeenCalledWith(
      expect.objectContaining({ task: "write tests", lane: "sub" }),
    );
  });

  it("emits agent:completed on success", async () => {
    vi.spyOn(processService, "createProcess").mockReturnValue(makeMockProcess("do work") as never);
    supervisor = makeSupervisor();

    const completed = vi.fn();
    bus.on("agent:completed", completed);

    await supervisor.spawn({
      task: "do work",
      lane: "sub",
      workdir: "/tmp",
      systemPrompt: "test",
      timeout: 5000,
    });

    expect(completed).toHaveBeenCalledWith(
      expect.objectContaining({ result: expect.stringContaining("completed: do work"), cost: 0.05 }),
    );
  });

  it("emits agent:failed and rethrows on process error", async () => {
    const errorProc = {
      pid: null,
      isRunning: false,
      onOutput: vi.fn(),
      run: vi.fn().mockRejectedValue(new Error("process died")),
      kill: vi.fn(),
      sendInput: vi.fn(),
    };
    vi.spyOn(processService, "createProcess").mockReturnValue(errorProc as never);
    supervisor = makeSupervisor();

    const failed = vi.fn();
    bus.on("agent:failed", failed);

    await expect(
      supervisor.spawn({ task: "bad task", lane: "sub", workdir: "/tmp", systemPrompt: "test", timeout: 5000 }),
    ).rejects.toThrow("process died");

    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ error: "process died", retryable: false }),
    );
  });

  it("listAgents returns empty array when no agents are active", () => {
    supervisor = makeSupervisor();
    expect(supervisor.listAgents()).toHaveLength(0);
  });

  it("canSpawn returns true when under limit", () => {
    vi.spyOn(processService, "createProcess").mockReturnValue(makeMockProcess("task") as never);
    supervisor = makeSupervisor(8);
    expect(supervisor.canSpawn()).toBe(true);
  });

  it("kill emits agent:killed", async () => {
    let killResolve!: () => void;
    const slowProc = {
      pid: 99999,
      isRunning: true,
      onOutput: vi.fn(),
      run: vi.fn(() => new Promise<{ output: string; exitCode: number; cost: number; durationMs: number }>((resolve) => {
        killResolve = () => resolve({ output: "killed", exitCode: 1, cost: 0, durationMs: 50 });
      })),
      kill: vi.fn(function (this: { isRunning: boolean }) {
        this.isRunning = false;
        killResolve();
      }),
      sendInput: vi.fn(),
    };
    vi.spyOn(processService, "createProcess").mockReturnValue(slowProc as never);
    supervisor = makeSupervisor();

    const killed = vi.fn();
    bus.on("agent:killed", killed);

    const spawnPromise = supervisor.spawn({
      task: "slow work",
      lane: "sub",
      workdir: "/tmp",
      systemPrompt: "test",
      timeout: 60000,
    });

    await new Promise((r) => setTimeout(r, 5));
    const agents = supervisor.listAgents();
    if (agents.length > 0) {
      supervisor.kill(agents[0].id, "test kill");
      expect(killed).toHaveBeenCalledWith(expect.objectContaining({ reason: "test kill" }));
    }

    await spawnPromise;
  });

  it("shutdown kills all agents and clears the list", () => {
    const proc1 = makeMockProcess("task1");
    const proc2 = makeMockProcess("task2");
    vi.spyOn(processService, "createProcess")
      .mockReturnValueOnce(proc1 as never)
      .mockReturnValueOnce(proc2 as never);
    supervisor = makeSupervisor();

    // Manually insert agents to simulate running state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agents = (supervisor as any).agents as Map<string, { handle: unknown; process: typeof proc1 }>;
    agents.set("id1", { handle: { id: "id1", state: "running" }, process: proc1 });
    agents.set("id2", { handle: { id: "id2", state: "running" }, process: proc2 });

    supervisor.shutdown();
    expect(supervisor.listAgents()).toHaveLength(0);
    expect(proc1.kill).toHaveBeenCalled();
    expect(proc2.kill).toHaveBeenCalled();
  });
});
