import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HealthMonitor } from "../../src/agents/health.js";
import { EventBus } from "../../src/bus/bus.js";

describe("HealthMonitor", () => {
  let monitor: HealthMonitor;
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    monitor = new HealthMonitor(bus, { stallThresholdMs: 100, checkIntervalMs: 50 });
  });

  afterEach(() => {
    monitor.stop();
  });

  it("detects stalled agents", async () => {
    const stalled = vi.fn();
    bus.on("agent:stalled", stalled);

    monitor.trackAgent("agent_1", Date.now() - 200);
    monitor.start();

    await new Promise((r) => setTimeout(r, 80));
    expect(stalled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent_1" }),
    );
  });

  it("does not flag active agents as stalled", async () => {
    const stalled = vi.fn();
    bus.on("agent:stalled", stalled);

    monitor.trackAgent("agent_1", Date.now());
    monitor.start();

    await new Promise((r) => setTimeout(r, 80));
    expect(stalled).not.toHaveBeenCalled();
  });

  it("updates last output time", async () => {
    const stalled = vi.fn();
    bus.on("agent:stalled", stalled);

    monitor.trackAgent("agent_1", Date.now() - 200);
    monitor.updateLastOutput("agent_1");
    monitor.start();

    await new Promise((r) => setTimeout(r, 80));
    expect(stalled).not.toHaveBeenCalled();
  });

  it("stops tracking removed agents", async () => {
    const stalled = vi.fn();
    bus.on("agent:stalled", stalled);

    monitor.trackAgent("agent_1", Date.now() - 200);
    monitor.untrackAgent("agent_1");
    monitor.start();

    await new Promise((r) => setTimeout(r, 80));
    expect(stalled).not.toHaveBeenCalled();
  });
});
