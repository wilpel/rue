import { Injectable } from "@nestjs/common";
import { BusService } from "../bus/bus.service.js";
import { SupervisorService } from "../agents/supervisor.service.js";
import { TaskDAG } from "./dag.service.js";
import { taskId } from "../shared/ids.js";

export interface TaskDefinition {
  task: string;
  dependsOn: string[];
}

@Injectable()
export class PlannerService {
  constructor(
    private readonly bus: BusService,
    private readonly supervisor: SupervisorService,
  ) {}

  createDAG(goal: string, tasks: TaskDefinition[]): TaskDAG {
    const dag = new TaskDAG(goal);
    const dagId = taskId();
    const nameToId = new Map<string, string>();
    for (const def of tasks) {
      const id = taskId();
      nameToId.set(def.task, id);
      dag.addNode({ id, task: def.task, status: "pending" });
    }
    for (const def of tasks) {
      const toId = nameToId.get(def.task)!;
      for (const depName of def.dependsOn) {
        const fromId = nameToId.get(depName);
        if (fromId) dag.addEdge(fromId, toId);
      }
    }
    this.bus.emit("task:created", { id: dagId, goal, nodeCount: tasks.length });
    return dag;
  }

  async execute(dag: TaskDAG, opts: { workdir: string; timeout: number; systemPrompt?: string }): Promise<void> {
    const dagId = taskId();
    while (!dag.isComplete() && !dag.hasFailed()) {
      const ready = dag.getReadyNodes();
      if (ready.length === 0) break;
      for (const node of ready) dag.updateStatus(node.id, "running");
      await Promise.all(ready.map(async (node) => {
        try {
          const result = await this.supervisor.spawn({ task: node.task, lane: "sub", workdir: opts.workdir, systemPrompt: opts.systemPrompt ?? "", timeout: opts.timeout });
          dag.updateStatus(node.id, "completed", result.output);
          this.bus.emit("task:updated", { id: dagId, nodeId: node.id, status: "completed" });
        } catch (error) {
          dag.updateStatus(node.id, "failed", undefined, error instanceof Error ? error.message : String(error));
          this.bus.emit("task:updated", { id: dagId, nodeId: node.id, status: "failed" });
        }
      }));
    }
    if (dag.isComplete()) this.bus.emit("task:completed", { id: dagId, result: dag.goal });
  }
}
