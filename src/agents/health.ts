import { EventBus } from "../bus/bus.js";

export interface HealthConfig {
  stallThresholdMs: number;
  checkIntervalMs: number;
}

export class HealthMonitor {
  private tracked = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private emittedStalls = new Set<string>();

  constructor(
    private readonly bus: EventBus,
    private readonly config: HealthConfig,
  ) {}

  trackAgent(agentId: string, lastOutputAt: number): void {
    this.tracked.set(agentId, lastOutputAt);
  }

  untrackAgent(agentId: string): void {
    this.tracked.delete(agentId);
    this.emittedStalls.delete(agentId);
  }

  updateLastOutput(agentId: string): void {
    this.tracked.set(agentId, Date.now());
    this.emittedStalls.delete(agentId);
  }

  start(): void {
    this.timer = setInterval(() => this.check(), this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private check(): void {
    const now = Date.now();
    for (const [agentId, lastOutput] of this.tracked) {
      const elapsed = now - lastOutput;
      if (elapsed >= this.config.stallThresholdMs && !this.emittedStalls.has(agentId)) {
        this.emittedStalls.add(agentId);
        this.bus.emit("agent:stalled", { id: agentId, lastOutputMs: elapsed });
      }
    }
  }
}
