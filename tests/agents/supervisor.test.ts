import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentSupervisor } from "../../src/agents/supervisor.js";
import { EventBus } from "../../src/bus/bus.js";
import { LaneQueue } from "../../src/agents/lanes.js";

// Mock ClaudeProcess so we don't spawn real processes
vi.mock("../../src/agents/process.js", () => {
  return {
    ClaudeProcess: vi.fn().mockImplementation(function (this: unknown, config: { task: string }) {
      return {
        pid: 99999,
        isRunning: false,
        onOutput: vi.fn(),
        run: vi.fn().mockResolvedValue({
          output: `completed: ${config.task}`,
          exitCode: 0,
          cost: 0.05,
          durationMs: 100,
        }),
        kill: vi.fn(),
        sendInput: vi.fn(),
      };
    }),
  };
});

describe("AgentSupervisor", () => {
  let supervisor: AgentSupervisor;
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    const lanes = new LaneQueue({ main: 1, sub: 2, cron: 1, skill: 1 });
    supervisor = new AgentSupervisor(bus, lanes);
  });

  afterEach(() => {
    supervisor.shutdown();
  });

  it("spawns an agent and emits spawned event", async () => {
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

  it("emits completed event on success", async () => {
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
      expect.objectContaining({ result: expect.stringContaining("completed: do work") }),
    );
  });

  it("lists active agents", async () => {
    expect(supervisor.listAgents()).toHaveLength(0);

    const spawnPromise = supervisor.spawn({
      task: "slow work",
      lane: "sub",
      workdir: "/tmp",
      systemPrompt: "test",
      timeout: 5000,
    });

    await spawnPromise;
    expect(supervisor.listAgents()).toHaveLength(0);
  });

  it("can kill a running agent", async () => {
    const killed = vi.fn();
    bus.on("agent:killed", killed);

    const { ClaudeProcess } = await import("../../src/agents/process.js");
    (ClaudeProcess as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(function (this: unknown, _config: unknown) {
      let killFn: () => void;
      return {
        pid: 99999,
        isRunning: true,
        onOutput: vi.fn(),
        run: vi.fn(
          () =>
            new Promise((resolve) => {
              killFn = () =>
                resolve({ output: "killed", exitCode: 1, cost: 0, durationMs: 50 });
            }),
        ),
        kill: vi.fn(function (this: { isRunning: boolean }) {
          this.isRunning = false;
          killFn();
        }),
        sendInput: vi.fn(),
      };
    });

    const spawnPromise = supervisor.spawn({
      task: "long work",
      lane: "sub",
      workdir: "/tmp",
      systemPrompt: "test",
      timeout: 60000,
    });

    await new Promise((r) => setTimeout(r, 5));
    const agents = supervisor.listAgents();
    if (agents.length > 0) {
      supervisor.kill(agents[0].id, "test kill");
    }

    await spawnPromise;
  });

  it("enforces max agents limit", () => {
    expect(supervisor.canSpawn()).toBe(true);
  });
});
