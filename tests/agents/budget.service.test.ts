import { describe, it, expect, vi, beforeEach } from "vitest";
import { BudgetService } from "../../src/agents/budget.service.js";

describe("BudgetService", () => {
  let budget: BudgetService;
  const mockBus = { on: vi.fn(), emit: vi.fn() };
  const mockConfig = { budgets: { dailyCeiling: 10 } };

  beforeEach(() => {
    vi.clearAllMocks();
    budget = new BudgetService(mockBus as any, mockConfig as any);
  });

  it("starts with zero spend", () => {
    expect(budget.todaySpend()).toBe(0);
  });

  it("tracks cost from recordCost", () => {
    budget.recordCost(1.5);
    budget.recordCost(2.0);
    expect(budget.todaySpend()).toBe(3.5);
  });

  it("canSpend returns true when under ceiling", () => {
    budget.recordCost(5);
    expect(budget.canSpend()).toBe(true);
  });

  it("canSpend returns false when at or over ceiling", () => {
    budget.recordCost(10);
    expect(budget.canSpend()).toBe(false);
  });

  it("summary returns spend and ceiling", () => {
    budget.recordCost(3.5);
    const s = budget.summary();
    expect(s.todayUsd).toBe(3.5);
    expect(s.dailyCeilingUsd).toBe(10);
    expect(s.remainingUsd).toBe(6.5);
  });

  it("registers bus listener on init", () => {
    budget.onModuleInit();
    expect(mockBus.on).toHaveBeenCalledWith("agent:completed", expect.any(Function));
  });

  it("bus listener calls recordCost", () => {
    budget.onModuleInit();
    const handler = mockBus.on.mock.calls[0][1];
    handler({ id: "agent-1", result: "ok", cost: 2.5 });
    expect(budget.todaySpend()).toBe(2.5);
  });
});
