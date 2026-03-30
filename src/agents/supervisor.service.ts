import { Injectable } from "@nestjs/common";
import { BusService } from "../bus/bus.service.js";
import { LaneQueueService } from "./lane-queue.service.js";
import { ClaudeProcessService, ClaudeProcess } from "./claude-process.service.js";
import type { AgentConfig, AgentHandle, SpawnResult } from "./types.js";
import type { Lane } from "../shared/types.js";
import { agentId } from "../shared/ids.js";
import { ConfigService } from "../config/config.service.js";

export interface SpawnOptions {
  task: string;
  lane: Lane;
  workdir: string;
  systemPrompt: string;
  timeout: number;
  maxTurns?: number;
  parentId?: string;
  budget?: number;
  allowedTools?: string[];
}

@Injectable()
export class SupervisorService {
  private agents = new Map<string, { handle: AgentHandle; process: ClaudeProcess }>();
  private readonly maxAgents: number;

  constructor(
    private readonly bus: BusService,
    private readonly lanes: LaneQueueService,
    private readonly processService: ClaudeProcessService,
    config: ConfigService,
  ) {
    this.maxAgents = config.maxAgents;
  }

  async spawn(opts: SpawnOptions): Promise<SpawnResult> {
    const id = agentId();
    const config: AgentConfig = { id, ...opts };
    const handle: AgentHandle = { id, config, state: "spawning", pid: null, startedAt: Date.now(), cost: 0, lastOutputAt: Date.now() };
    const proc = this.processService.createProcess(config);
    proc.onOutput(() => { handle.lastOutputAt = Date.now(); this.bus.emit("agent:progress", { id, chunk: "" }); });
    this.agents.set(id, { handle, process: proc });
    this.bus.emit("agent:spawned", { id, task: opts.task, lane: opts.lane });

    try {
      const result = await this.lanes.enqueue(opts.lane, async () => {
        handle.state = "running";
        handle.pid = proc.pid;
        return proc.run();
      });
      handle.state = "completed";
      handle.cost = result.cost;
      this.bus.emit("agent:completed", { id, result: result.output, cost: result.cost });
      return result;
    } catch (error) {
      handle.state = "failed";
      const message = error instanceof Error ? error.message : String(error);
      this.bus.emit("agent:failed", { id, error: message, retryable: false });
      throw error;
    } finally {
      this.agents.delete(id);
    }
  }

  kill(id: string, reason: string): void {
    const entry = this.agents.get(id);
    if (!entry) return;
    entry.process.kill();
    entry.handle.state = "killed";
    this.bus.emit("agent:killed", { id, reason });
  }

  steer(id: string, message: string): void {
    this.agents.get(id)?.process.sendInput(message);
  }

  listAgents(): AgentHandle[] { return Array.from(this.agents.values()).map(e => e.handle); }
  getAgent(id: string): AgentHandle | undefined { return this.agents.get(id)?.handle; }
  canSpawn(): boolean { return this.agents.size < this.maxAgents; }

  shutdown(): void {
    for (const [, entry] of this.agents) { entry.process.kill(); entry.handle.state = "killed"; }
    this.agents.clear();
  }
}
