import { Injectable, Inject, OnModuleInit } from "@nestjs/common";
import { BusService } from "../bus/bus.service.js";
import { ConfigService } from "../config/config.service.js";
import { log } from "../shared/logger.js";

@Injectable()
export class BudgetService implements OnModuleInit {
  private dailySpend = 0;
  private currentDay = new Date().toISOString().split("T")[0];
  private readonly ceiling: number;

  constructor(
    @Inject(BusService) private readonly bus: BusService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.ceiling = config.budgets.dailyCeiling;
  }

  onModuleInit(): void {
    this.bus.on("agent:completed", (payload) => {
      this.recordCost(payload.cost);
    });
  }

  recordCost(usd: number): void {
    this.rolloverIfNewDay();
    this.dailySpend += usd;
    if (this.dailySpend >= this.ceiling) {
      log.warn(`[budget] Daily ceiling reached: $${this.dailySpend.toFixed(2)} / $${this.ceiling}`);
    }
  }

  canSpend(): boolean {
    this.rolloverIfNewDay();
    return this.dailySpend < this.ceiling;
  }

  todaySpend(): number {
    this.rolloverIfNewDay();
    return this.dailySpend;
  }

  summary(): { todayUsd: number; dailyCeilingUsd: number; remainingUsd: number } {
    this.rolloverIfNewDay();
    return {
      todayUsd: this.dailySpend,
      dailyCeilingUsd: this.ceiling,
      remainingUsd: Math.max(0, this.ceiling - this.dailySpend),
    };
  }

  private rolloverIfNewDay(): void {
    const today = new Date().toISOString().split("T")[0];
    if (today !== this.currentDay) {
      this.dailySpend = 0;
      this.currentDay = today;
    }
  }
}
