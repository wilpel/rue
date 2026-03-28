import { EventBus } from "../bus/bus.js";
import { LaneQueue } from "./lanes.js";
import { ClaudeProcess } from "./process.js";
import type { AgentConfig, AgentHandle, SpawnResult } from "./types.js";
import { agentId } from "../shared/ids.js";
import type { Lane } from "../shared/types.js";

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

type ProcessFactory = (config: AgentConfig) => ClaudeProcess;

export class AgentSupervisor {
  private agents = new Map<string, { handle: AgentHandle; process: ClaudeProcess }>();
  private maxAgents: number;
  private readonly createProcess: ProcessFactory;

  constructor(
    private readonly bus: EventBus,
    private readonly lanes: LaneQueue,
    opts?: { maxAgents?: number; createProcess?: ProcessFactory },
  ) {
    this.maxAgents = opts?.maxAgents ?? 8;
    this.createProcess = opts?.createProcess ?? ((config) => new ClaudeProcess(config));
  }

  async spawn(opts: SpawnOptions): Promise<SpawnResult> {
    const id = agentId();
    const config: AgentConfig = { id, ...opts };

    const handle: AgentHandle = {
      id,
      config,
      state: "spawning",
      pid: null,
      startedAt: Date.now(),
      cost: 0,
      lastOutputAt: Date.now(),
    };

    const proc = this.createProcess(config);

    proc.onOutput((chunk) => {
      handle.lastOutputAt = Date.now();
      this.bus.emit("agent:progress", { id, chunk });
    });

    this.agents.set(id, { handle, process: proc });

    this.bus.emit("agent:spawned", {
      id,
      task: opts.task,
      lane: opts.lane,
    });

    try {
      const result = await this.lanes.enqueue(opts.lane, async () => {
        handle.state = "running";
        handle.pid = proc.pid;
        return proc.run();
      });

      handle.state = "completed";
      handle.cost = result.cost;

      this.bus.emit("agent:completed", {
        id,
        result: result.output,
        cost: result.cost,
      });

      return result;
    } catch (error) {
      handle.state = "failed";
      const message = error instanceof Error ? error.message : String(error);

      this.bus.emit("agent:failed", {
        id,
        error: message,
        retryable: false,
      });

      throw error;
    } finally {
      this.agents.delete(id);
    }
  }

  kill(agentId: string, reason: string): void {
    const entry = this.agents.get(agentId);
    if (!entry) return;

    entry.process.kill();
    entry.handle.state = "killed";

    this.bus.emit("agent:killed", { id: agentId, reason });
  }

  steer(agentId: string, message: string): void {
    const entry = this.agents.get(agentId);
    if (!entry) return;
    entry.process.sendInput(message);
  }

  listAgents(): AgentHandle[] {
    return Array.from(this.agents.values()).map((e) => e.handle);
  }

  getAgent(agentId: string): AgentHandle | undefined {
    return this.agents.get(agentId)?.handle;
  }

  canSpawn(): boolean {
    return this.agents.size < this.maxAgents;
  }

  shutdown(): void {
    for (const [, entry] of this.agents) {
      entry.process.kill();
      entry.handle.state = "killed";
    }
    this.agents.clear();
  }
}
