import { describe, it, expect } from "vitest";
import { COLORS, LAYOUT } from "../../../../src/interfaces/cli/tui/theme.js";

describe("theme", () => {
  it("exports all required color keys", () => {
    expect(COLORS.primary).toBe("#E8B87A");
    expect(COLORS.secondary).toBe("#D4956B");
    expect(COLORS.success).toBe("#8BA87A");
    expect(COLORS.info).toBe("#7AA2D4");
    expect(COLORS.urgent).toBe("#C47070");
    expect(COLORS.dimmed).toBe("#6B6560");
    expect(COLORS.veryDim).toBe("#4A3F35");
    expect(COLORS.border).toBe("#3A3530");
    expect(COLORS.codeBg).toBe("#2A2520");
    expect(COLORS.codeText).toBe("#C9A87C");
    expect(COLORS.strongText).toBe("#E8CDA0");
    expect(COLORS.emText).toBe("#C9B89A");
    expect(COLORS.quoteText).toBe("#A89080");
  });

  it("exports layout constants", () => {
    expect(LAYOUT.chromeHeight).toBe(6);
    expect(LAYOUT.minContentHeight).toBe(8);
    expect(LAYOUT.sidebarBreakpoint).toBe(90);
    expect(LAYOUT.minSidebarWidth).toBe(28);
    expect(LAYOUT.sidebarRatio).toBe(0.3);
    expect(LAYOUT.agentPanelRatio).toBe(0.2);
    expect(LAYOUT.taskPanelRatio).toBe(0.2);
    expect(LAYOUT.usagePanelRatio).toBe(0.25);
    expect(LAYOUT.minPanelHeight).toBe(3);
    expect(LAYOUT.minUsagePanelHeight).toBe(5);
    expect(LAYOUT.maxEvents).toBe(50);
    expect(LAYOUT.usageHistoryMax).toBe(100);
    expect(LAYOUT.taskPollIntervalMs).toBe(3000);
    expect(LAYOUT.tokenSampleIntervalMs).toBe(5000);
    expect(LAYOUT.completedAgentLingerMs).toBe(3000);
    expect(LAYOUT.failedAgentLingerMs).toBe(5000);
  });

  it("exports network constants", () => {
    expect(LAYOUT.reconnectBaseMs).toBe(1000);
    expect(LAYOUT.reconnectMaxMs).toBe(30000);
    expect(LAYOUT.pingIntervalMs).toBe(30000);
    expect(LAYOUT.pongTimeoutMs).toBe(10000);
    expect(LAYOUT.requestTimeoutMs).toBe(60000);
  });
});
