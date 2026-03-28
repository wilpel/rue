import { describe, it, expect, beforeEach } from "vitest";
import { ResourceGovernor } from "../../src/agents/governor.js";

describe("ResourceGovernor", () => {
  let governor: ResourceGovernor;

  beforeEach(() => {
    governor = new ResourceGovernor({ dailyCeiling: 10, maxAgents: 4 });
  });

  it("tracks cost per agent", () => {
    governor.recordCost("agent_1", 0.50);
    governor.recordCost("agent_1", 0.25);
    expect(governor.agentCost("agent_1")).toBe(0.75);
  });

  it("tracks total daily cost", () => {
    governor.recordCost("agent_1", 1.00);
    governor.recordCost("agent_2", 2.00);
    expect(governor.dailyCost()).toBe(3.00);
  });

  it("reports budget exceeded when daily ceiling hit", () => {
    governor.recordCost("agent_1", 10.00);
    expect(governor.isBudgetExceeded()).toBe(true);
  });

  it("reports warning at 80% of budget", () => {
    governor.recordCost("agent_1", 8.00);
    expect(governor.isBudgetWarning()).toBe(true);
    expect(governor.isBudgetExceeded()).toBe(false);
  });

  it("checks per-agent budget", () => {
    governor.recordCost("agent_1", 3.00);
    expect(governor.isAgentOverBudget("agent_1", 2.00)).toBe(true);
    expect(governor.isAgentOverBudget("agent_1", 5.00)).toBe(false);
  });

  it("resets daily cost", () => {
    governor.recordCost("agent_1", 5.00);
    governor.resetDaily();
    expect(governor.dailyCost()).toBe(0);
  });

  it("returns cost summary", () => {
    governor.recordCost("agent_1", 1.00);
    governor.recordCost("agent_2", 2.00);
    const summary = governor.summary();
    expect(summary.daily).toBe(3.00);
    expect(summary.ceiling).toBe(10);
    expect(summary.agents["agent_1"]).toBe(1.00);
    expect(summary.agents["agent_2"]).toBe(2.00);
  });
});
