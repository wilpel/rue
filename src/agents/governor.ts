export interface GovernorConfig {
  dailyCeiling: number;
  maxAgents: number;
}

export interface CostSummary {
  daily: number;
  ceiling: number;
  warningThreshold: number;
  agents: Record<string, number>;
}

export class ResourceGovernor {
  private costs = new Map<string, number>();
  private readonly config: GovernorConfig;

  constructor(config: GovernorConfig) {
    this.config = config;
  }

  recordCost(agentId: string, amount: number): void {
    const current = this.costs.get(agentId) ?? 0;
    this.costs.set(agentId, current + amount);
  }

  agentCost(agentId: string): number {
    return this.costs.get(agentId) ?? 0;
  }

  dailyCost(): number {
    let total = 0;
    for (const cost of this.costs.values()) {
      total += cost;
    }
    return total;
  }

  isBudgetExceeded(): boolean {
    return this.dailyCost() >= this.config.dailyCeiling;
  }

  isBudgetWarning(): boolean {
    return this.dailyCost() >= this.config.dailyCeiling * 0.8;
  }

  isAgentOverBudget(agentId: string, budget: number): boolean {
    return this.agentCost(agentId) > budget;
  }

  resetDaily(): void {
    this.costs.clear();
  }

  summary(): CostSummary {
    const agents: Record<string, number> = {};
    for (const [id, cost] of this.costs) {
      agents[id] = cost;
    }
    return {
      daily: this.dailyCost(),
      ceiling: this.config.dailyCeiling,
      warningThreshold: this.config.dailyCeiling * 0.8,
      agents,
    };
  }
}
