import { describe, it, expect, beforeEach } from "vitest";
import { TaskDAG, type TaskNode } from "../../../src/cortex/prefrontal/dag.js";

describe("TaskDAG", () => {
  let dag: TaskDAG;

  beforeEach(() => {
    dag = new TaskDAG("test-goal");
  });

  it("adds nodes", () => {
    dag.addNode({ id: "t1", task: "analyze code", status: "pending" });
    expect(dag.getNode("t1")).toBeDefined();
    expect(dag.getNode("t1")!.task).toBe("analyze code");
  });

  it("adds edges (dependencies)", () => {
    dag.addNode({ id: "t1", task: "analyze", status: "pending" });
    dag.addNode({ id: "t2", task: "refactor", status: "pending" });
    dag.addEdge("t1", "t2");
    expect(dag.getDependencies("t2")).toEqual(["t1"]);
  });

  it("returns ready nodes (no unfinished dependencies)", () => {
    dag.addNode({ id: "t1", task: "analyze", status: "pending" });
    dag.addNode({ id: "t2", task: "refactor", status: "pending" });
    dag.addEdge("t1", "t2");
    const ready = dag.getReadyNodes();
    expect(ready.map((n) => n.id)).toEqual(["t1"]);
  });

  it("unlocks dependent nodes when dependency completes", () => {
    dag.addNode({ id: "t1", task: "analyze", status: "pending" });
    dag.addNode({ id: "t2", task: "refactor", status: "pending" });
    dag.addNode({ id: "t3", task: "test", status: "pending" });
    dag.addEdge("t1", "t2");
    dag.addEdge("t1", "t3");
    dag.updateStatus("t1", "completed");
    const ready = dag.getReadyNodes();
    expect(ready.map((n) => n.id).sort()).toEqual(["t2", "t3"]);
  });

  it("returns parallel-ready nodes", () => {
    dag.addNode({ id: "t1", task: "a", status: "pending" });
    dag.addNode({ id: "t2", task: "b", status: "pending" });
    dag.addNode({ id: "t3", task: "c", status: "pending" });
    dag.addEdge("t1", "t3");
    dag.addEdge("t2", "t3");
    const ready = dag.getReadyNodes();
    expect(ready).toHaveLength(2);
    expect(ready.map((n) => n.id).sort()).toEqual(["t1", "t2"]);
  });

  it("detects completion (all nodes done)", () => {
    dag.addNode({ id: "t1", task: "a", status: "pending" });
    dag.addNode({ id: "t2", task: "b", status: "pending" });
    expect(dag.isComplete()).toBe(false);
    dag.updateStatus("t1", "completed");
    expect(dag.isComplete()).toBe(false);
    dag.updateStatus("t2", "completed");
    expect(dag.isComplete()).toBe(true);
  });

  it("detects failure (any node failed)", () => {
    dag.addNode({ id: "t1", task: "a", status: "pending" });
    dag.addNode({ id: "t2", task: "b", status: "pending" });
    dag.updateStatus("t1", "failed");
    expect(dag.hasFailed()).toBe(true);
  });

  it("returns topological order", () => {
    dag.addNode({ id: "t1", task: "a", status: "pending" });
    dag.addNode({ id: "t2", task: "b", status: "pending" });
    dag.addNode({ id: "t3", task: "c", status: "pending" });
    dag.addEdge("t1", "t2");
    dag.addEdge("t2", "t3");
    const order = dag.topologicalOrder();
    expect(order).toEqual(["t1", "t2", "t3"]);
  });

  it("returns all nodes", () => {
    dag.addNode({ id: "t1", task: "a", status: "pending" });
    dag.addNode({ id: "t2", task: "b", status: "pending" });
    expect(dag.allNodes()).toHaveLength(2);
  });
});
