import { Injectable, Inject, OnModuleInit } from "@nestjs/common";
import { BusService } from "../bus/bus.service.js";
import { WorkspaceService } from "./workspace.service.js";

@Injectable()
export class WorkspaceIntegrationService implements OnModuleInit {
  constructor(
    @Inject(BusService) private readonly bus: BusService,
    @Inject(WorkspaceService) private readonly workspace: WorkspaceService,
  ) {}

  onModuleInit(): void {
    this.bus.on("message:created", (payload) => {
      this.workspace.postSignal({
        source: `message:${payload.role}`,
        type: "new-message",
        content: payload.content.slice(0, 100),
        salience: payload.role === "user" ? 0.7 : 0.3,
        ttlMs: 600_000, // 10 min
      });
    });

    this.bus.on("task:created", (payload) => {
      this.workspace.postSignal({
        source: "tasks",
        type: "task-created",
        content: payload.goal,
        salience: 0.5,
        ttlMs: 1_800_000, // 30 min
      });
    });

    this.bus.on("agent:completed", (payload) => {
      this.workspace.postSignal({
        source: "agents",
        type: "agent-done",
        content: payload.result.slice(0, 80),
        salience: 0.4,
        ttlMs: 300_000,
      });
    });

    this.bus.on("agent:failed", (payload) => {
      this.workspace.postSignal({
        source: "agents",
        type: "agent-failed",
        content: payload.error.slice(0, 80),
        salience: 0.8,
        ttlMs: 900_000, // 15 min — failures stay salient longer
      });
    });
  }
}
