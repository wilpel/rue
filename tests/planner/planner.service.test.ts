import { describe, it, expect, vi } from "vitest";
import { PlannerService } from "../../src/planner/planner.service.js";
import { BusService } from "../../src/bus/bus.service.js";
import type { SupervisorService } from "../../src/agents/supervisor.service.js";

describe("PlannerService", () => {
  it("creates a DAG from task definitions", () => {
    const bus = new BusService();
    const mockSupervisor = {} as SupervisorService;
    const planner = new PlannerService(bus, mockSupervisor);

    const dag = planner.createDAG("build app", [
      { task: "setup", dependsOn: [] },
      { task: "implement", dependsOn: ["setup"] },
      { task: "test", dependsOn: ["implement"] },
    ]);

    expect(dag.allNodes()).toHaveLength(3);
    expect(dag.getReadyNodes()).toHaveLength(1);
    expect(dag.getReadyNodes()[0].task).toBe("setup");
  });

  it("executes DAG nodes in order", async () => {
    const bus = new BusService();
    const mockSupervisor = {
      spawn: vi.fn().mockResolvedValue({ output: "done", exitCode: 0, cost: 0, durationMs: 100 }),
    } as unknown as SupervisorService;
    const planner = new PlannerService(bus, mockSupervisor);

    const dag = planner.createDAG("test", [
      { task: "first", dependsOn: [] },
      { task: "second", dependsOn: ["first"] },
    ]);

    await planner.execute(dag, { workdir: "/tmp", timeout: 60000 });
    expect(dag.isComplete()).toBe(true);
    expect(mockSupervisor.spawn).toHaveBeenCalledTimes(2);
  });

  it("stops on failure", async () => {
    const bus = new BusService();
    const mockSupervisor = {
      spawn: vi.fn().mockRejectedValue(new Error("crash")),
    } as unknown as SupervisorService;
    const planner = new PlannerService(bus, mockSupervisor);

    const dag = planner.createDAG("test", [
      { task: "fail-task", dependsOn: [] },
      { task: "never-runs", dependsOn: ["fail-task"] },
    ]);

    await planner.execute(dag, { workdir: "/tmp", timeout: 60000 });
    expect(dag.hasFailed()).toBe(true);
    expect(dag.getNode(dag.allNodes().find(n => n.task === "never-runs")!.id)?.status).toBe("pending");
  });
});
