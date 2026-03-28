import { taskId } from "../../shared/ids.js";
import type { EventBus } from "../../bus/bus.js";
import type { AgentSupervisor } from "../../agents/supervisor.js";
import { TaskDAG } from "./dag.js";

export interface TaskDefinition {
  task: string;
  dependsOn: string[];
}

export interface PlannerOptions {
  workdir: string;
  defaultTimeout: number;
  systemPrompt?: string;
}

export class Planner {
  constructor(
    private readonly bus: EventBus,
    private readonly supervisor: AgentSupervisor,
    private readonly opts: PlannerOptions,
  ) {}

  createDAG(goal: string, tasks: TaskDefinition[]): TaskDAG {
    const dag = new TaskDAG(goal);
    const dagId = taskId();

    // Map task names to generated IDs
    const nameToId = new Map<string, string>();
    for (const def of tasks) {
      const id = taskId();
      nameToId.set(def.task, id);
      dag.addNode({ id, task: def.task, status: "pending" });
    }

    // Add edges based on dependsOn names
    for (const def of tasks) {
      const toId = nameToId.get(def.task)!;
      for (const depName of def.dependsOn) {
        const fromId = nameToId.get(depName);
        if (fromId) {
          dag.addEdge(fromId, toId);
        }
      }
    }

    this.bus.emit("task:created", {
      id: dagId,
      goal,
      nodeCount: tasks.length,
    });

    return dag;
  }

  async execute(dag: TaskDAG): Promise<void> {
    const dagId = taskId();

    while (!dag.isComplete() && !dag.hasFailed()) {
      const ready = dag.getReadyNodes();
      if (ready.length === 0) break;

      // Mark all ready nodes as running
      for (const node of ready) {
        dag.updateStatus(node.id, "running");
      }

      // Execute all ready nodes in parallel
      await Promise.all(
        ready.map(async (node) => {
          try {
            const result = await this.supervisor.spawn({
              task: node.task,
              lane: "sub",
              workdir: this.opts.workdir,
              systemPrompt: this.opts.systemPrompt ?? "",
              timeout: this.opts.defaultTimeout,
            });

            dag.updateStatus(node.id, "completed", result.output);

            this.bus.emit("task:updated", {
              id: dagId,
              nodeId: node.id,
              status: "completed",
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            dag.updateStatus(node.id, "failed", undefined, message);

            this.bus.emit("task:updated", {
              id: dagId,
              nodeId: node.id,
              status: "failed",
            });
          }
        }),
      );
    }

    if (dag.isComplete()) {
      this.bus.emit("task:completed", {
        id: dagId,
        result: dag.goal,
      });
    }
  }
}
