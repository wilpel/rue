import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { nanoid } from "nanoid";
import { BusService } from "../bus/bus.service.js";
import { ConfigService } from "../config/config.service.js";
import type { Signal } from "./workspace.types.js";
import { log } from "../shared/logger.js";

const DEFAULT_TTL_MS = 300_000; // 5 minutes
const DECAY_THRESHOLD = 0.01;

@Injectable()
export class WorkspaceService implements OnModuleInit, OnModuleDestroy {
  private signals: Signal[] = [];
  private timer: NodeJS.Timeout | null = null;

  private readonly maxSignals: number;
  private readonly topN: number;
  private readonly tickMs: number;
  private readonly enabled: boolean;

  constructor(
    @Inject(BusService) private readonly bus: BusService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.maxSignals = config.workspace.maxSignals;
    this.topN = config.workspace.topN;
    this.tickMs = config.workspace.tickMs;
    this.enabled = config.workspace.enabled;
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
    log.info(`[workspace] Started (tick: ${this.tickMs}ms, max: ${this.maxSignals}, top: ${this.topN})`);
  }

  onModuleDestroy(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  postSignal(input: Omit<Signal, "id" | "timestamp">): void {
    const signal: Signal = {
      ...input,
      id: nanoid(8),
      timestamp: Date.now(),
      ttlMs: input.ttlMs ?? DEFAULT_TTL_MS,
    };
    this.signals.push(signal);

    // Evict lowest-salience if over max
    if (this.signals.length > this.maxSignals) {
      const now = Date.now();
      this.signals.sort((a, b) => this.effectiveSalience(b, now) - this.effectiveSalience(a, now));
      this.signals = this.signals.slice(0, this.maxSignals);
    }
  }

  getTopSignals(n?: number): Signal[] {
    const now = Date.now();
    return [...this.signals]
      .map(s => ({ signal: s, eff: this.effectiveSalience(s, now) }))
      .filter(s => s.eff >= DECAY_THRESHOLD)
      .sort((a, b) => b.eff - a.eff)
      .slice(0, n ?? this.topN)
      .map(s => s.signal);
  }

  toPromptText(): string {
    const top = this.getTopSignals();
    if (top.length === 0) return "";
    const now = Date.now();
    const lines = top.map(s => {
      const eff = this.effectiveSalience(s, now).toFixed(2);
      return `- [${s.source}] ${s.content} (salience: ${eff})`;
    });
    return lines.join("\n");
  }

  clear(): void {
    this.signals = [];
  }

  toSnapshot(): string { return JSON.stringify(this.signals); }
  fromSnapshot(json: string): void { this.signals = JSON.parse(json); }

  get signalCount(): number { return this.signals.length; }

  private tick(): void {
    const now = Date.now();
    // Prune expired signals
    this.signals = this.signals.filter(s => this.effectiveSalience(s, now) >= DECAY_THRESHOLD);
    // Broadcast top signals
    const top = this.getTopSignals();
    if (top.length > 0) {
      this.bus.emit("workspace:broadcast", { top, timestamp: now });
    }
  }

  private effectiveSalience(signal: Signal, now: number): number {
    const ageMs = Math.max(0, now - signal.timestamp);
    return signal.salience * Math.exp(-ageMs / signal.ttlMs);
  }
}
