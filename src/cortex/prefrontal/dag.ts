import type { TaskStatus } from "../../shared/types.js";

export interface TaskNode {
  id: string;
  task: string;
  status: TaskStatus;
  result?: string;
  error?: string;
}

export class TaskDAG {
  private nodes = new Map<string, TaskNode>();
  // edges: from -> Set<to>  (dependency direction: from must complete before to)
  private edges = new Map<string, Set<string>>();
  // reverseEdges: to -> Set<from>  (what does "to" depend on)
  private reverseEdges = new Map<string, Set<string>>();

  constructor(public readonly goal: string) {}

  addNode(node: TaskNode): void {
    this.nodes.set(node.id, { ...node });
    if (!this.edges.has(node.id)) {
      this.edges.set(node.id, new Set());
    }
    if (!this.reverseEdges.has(node.id)) {
      this.reverseEdges.set(node.id, new Set());
    }
  }

  addEdge(from: string, to: string): void {
    const fromEdges = this.edges.get(from) ?? new Set<string>();
    fromEdges.add(to);
    this.edges.set(from, fromEdges);

    const toReverse = this.reverseEdges.get(to) ?? new Set<string>();
    toReverse.add(from);
    this.reverseEdges.set(to, toReverse);
  }

  getNode(id: string): TaskNode | undefined {
    const node = this.nodes.get(id);
    return node ? { ...node } : undefined;
  }

  getDependencies(id: string): string[] {
    const deps = this.reverseEdges.get(id);
    return deps ? Array.from(deps) : [];
  }

  updateStatus(id: string, status: TaskStatus, result?: string, error?: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.status = status;
    if (result !== undefined) node.result = result;
    if (error !== undefined) node.error = error;
  }

  getReadyNodes(): TaskNode[] {
    const ready: TaskNode[] = [];
    for (const [id, node] of this.nodes) {
      if (node.status !== "pending") continue;
      const deps = this.reverseEdges.get(id) ?? new Set<string>();
      const allDepsDone = Array.from(deps).every((depId) => {
        const dep = this.nodes.get(depId);
        return dep?.status === "completed";
      });
      if (allDepsDone) {
        ready.push({ ...node });
      }
    }
    return ready;
  }

  isComplete(): boolean {
    if (this.nodes.size === 0) return true;
    return Array.from(this.nodes.values()).every((n) => n.status === "completed");
  }

  hasFailed(): boolean {
    return Array.from(this.nodes.values()).some((n) => n.status === "failed");
  }

  allNodes(): TaskNode[] {
    return Array.from(this.nodes.values()).map((n) => ({ ...n }));
  }

  topologicalOrder(): string[] {
    const inDegree = new Map<string, number>();
    for (const id of this.nodes.keys()) {
      inDegree.set(id, 0);
    }
    for (const [, targets] of this.edges) {
      for (const target of targets) {
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      const targets = this.edges.get(current) ?? new Set<string>();
      for (const target of targets) {
        const newDegree = (inDegree.get(target) ?? 1) - 1;
        inDegree.set(target, newDegree);
        if (newDegree === 0) queue.push(target);
      }
    }

    return order;
  }
}
