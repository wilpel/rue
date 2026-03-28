import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Planner } from "../../../../src/cortex/prefrontal/planner.js";
import { EventBus } from "../../../../src/bus/bus.js";
import { AgentSupervisor } from "../../../../src/agents/supervisor.js";
import { LaneQueue } from "../../../../src/agents/lanes.js";
import { TaskDAG } from "../../../../src/cortex/prefrontal/dag.js";

vi.mock("../../../src/agents/process.js", () => ({
  ClaudeProcess: vi.fn().mockImplementation(function(config) {
    return {
      pid: 99999,
      isRunning: false,
      onOutput: vi.fn(),
      run: vi.fn().mockResolvedValue({
        output: `result for: ${config.task}`,
        exitCode: 0,
        cost: 0.01,
        durationMs: 50,
      }),
      kill: vi.fn(),
      sendInput: vi.fn(),
    };
  }),
}));

describe("Planner", () => {
  let planner: Planner;
  let bus: EventBus;
  let supervisor: AgentSupervisor;

  beforeEach(() => {
    bus = new EventBus();
    const lanes = new LaneQueue({ main: 1, sub: 4, cron: 1, skill: 1 });
    supervisor = new AgentSupervisor(bus, lanes);
    planner = new Planner(bus, supervisor, { workdir: "/tmp", defaultTimeout: 5000 });
  });

  afterEach(() => {
    supervisor.shutdown();
  });

  it("creates a DAG from a flat task list", () => {
    const dag = planner.createDAG("refactor auth", [
      { task: "analyze current code", dependsOn: [] },
      { task: "refactor module", dependsOn: ["analyze current code"] },
      { task: "run tests", dependsOn: ["refactor module"] },
    ]);
    expect(dag.allNodes()).toHaveLength(3);
    expect(dag.getReadyNodes()).toHaveLength(1);
    expect(dag.getReadyNodes()[0].task).toBe("analyze current code");
  });

  it("executes a simple sequential DAG", async () => {
    const completed = vi.fn();
    bus.on("task:completed", completed);
    const dag = planner.createDAG("simple task", [
      { task: "step one", dependsOn: [] },
      { task: "step two", dependsOn: ["step one"] },
    ]);
    await planner.execute(dag);
    expect(dag.isComplete()).toBe(true);
    expect(completed).toHaveBeenCalledOnce();
  });

  it("executes parallel nodes concurrently", async () => {
    const dag = planner.createDAG("parallel work", [
      { task: "task a", dependsOn: [] },
      { task: "task b", dependsOn: [] },
      { task: "combine", dependsOn: ["task a", "task b"] },
    ]);
    await planner.execute(dag);
    expect(dag.isComplete()).toBe(true);
  });

  it("emits task:created event", () => {
    const created = vi.fn();
    bus.on("task:created", created);
    planner.createDAG("test", [{ task: "do thing", dependsOn: [] }]);
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ goal: "test", nodeCount: 1 }));
  });
});
