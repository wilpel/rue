import { describe, it, expect } from "vitest";
import { TaskDAG } from "../../src/planner/dag.service.js";

describe("TaskDAG", () => {
  it("tracks nodes and reports ready ones", () => {
    const dag = new TaskDAG("test goal");
    dag.addNode({ id: "a", task: "task A", status: "pending" });
    dag.addNode({ id: "b", task: "task B", status: "pending" });
    dag.addEdge("a", "b");
    const ready = dag.getReadyNodes();
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("a");
  });

  it("unblocks dependents when deps complete", () => {
    const dag = new TaskDAG("test");
    dag.addNode({ id: "a", task: "A", status: "pending" });
    dag.addNode({ id: "b", task: "B", status: "pending" });
    dag.addEdge("a", "b");
    dag.updateStatus("a", "completed");
    expect(dag.getReadyNodes().map(n => n.id)).toEqual(["b"]);
  });

  it("detects completion", () => {
    const dag = new TaskDAG("test");
    dag.addNode({ id: "a", task: "A", status: "pending" });
    expect(dag.isComplete()).toBe(false);
    dag.updateStatus("a", "completed");
    expect(dag.isComplete()).toBe(true);
  });

  it("detects failure", () => {
    const dag = new TaskDAG("test");
    dag.addNode({ id: "a", task: "A", status: "pending" });
    dag.updateStatus("a", "failed", undefined, "boom");
    expect(dag.hasFailed()).toBe(true);
  });

  it("produces topological order", () => {
    const dag = new TaskDAG("test");
    dag.addNode({ id: "a", task: "A", status: "pending" });
    dag.addNode({ id: "b", task: "B", status: "pending" });
    dag.addNode({ id: "c", task: "C", status: "pending" });
    dag.addEdge("a", "b");
    dag.addEdge("b", "c");
    expect(dag.topologicalOrder()).toEqual(["a", "b", "c"]);
  });

  it("empty DAG is complete", () => {
    expect(new TaskDAG("empty").isComplete()).toBe(true);
  });
});
