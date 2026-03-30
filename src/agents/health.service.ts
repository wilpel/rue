import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { BusService } from "../bus/bus.service.js";
import { ConfigService } from "../config/config.service.js";

@Injectable()
export class HealthService implements OnModuleDestroy {
  private tracked = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private emittedStalls = new Set<string>();
  private readonly stallThresholdMs: number;
  private readonly checkIntervalMs: number;

  constructor(private readonly bus: BusService, config: ConfigService) {
    this.stallThresholdMs = config.stall.timeoutMs;
    this.checkIntervalMs = config.stall.nudgeMs;
  }

  trackAgent(agentId: string, lastOutputAt: number): void { this.tracked.set(agentId, lastOutputAt); }
  untrackAgent(agentId: string): void { this.tracked.delete(agentId); this.emittedStalls.delete(agentId); }
  updateLastOutput(agentId: string): void { this.tracked.set(agentId, Date.now()); this.emittedStalls.delete(agentId); }

  start(): void { this.timer = setInterval(() => this.check(), this.checkIntervalMs); }

  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  onModuleDestroy(): void { this.stop(); }

  private check(): void {
    const now = Date.now();
    for (const [agentId, lastOutput] of this.tracked) {
      const elapsed = now - lastOutput;
      if (elapsed >= this.stallThresholdMs && !this.emittedStalls.has(agentId)) {
        this.emittedStalls.add(agentId);
        this.bus.emit("agent:stalled", { id: agentId, lastOutputMs: elapsed });
      }
    }
  }
}
