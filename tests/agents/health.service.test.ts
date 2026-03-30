import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HealthService } from "../../src/agents/health.service.js";
import { BusService } from "../../src/bus/bus.service.js";
import { ConfigService } from "../../src/config/config.service.js";

function makeConfig(stallMs = 100, nudgeMs = 50): ConfigService {
  return {
    stall: { timeoutMs: stallMs, nudgeMs },
  } as unknown as ConfigService;
}

describe("HealthService", () => {
  let service: HealthService;
  let bus: BusService;

  beforeEach(() => {
    bus = new BusService();
    service = new HealthService(bus, makeConfig(100, 50));
  });

  afterEach(() => {
    service.stop();
  });

  it("detects stalled agents and emits agent:stalled", async () => {
    const stalled = vi.fn();
    bus.on("agent:stalled", stalled);

    service.trackAgent("agent_1", Date.now() - 200);
    service.start();

    await new Promise((r) => setTimeout(r, 80));
    expect(stalled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent_1" }),
    );
  });

  it("does not flag active agents as stalled", async () => {
    const stalled = vi.fn();
    bus.on("agent:stalled", stalled);

    service.trackAgent("agent_1", Date.now());
    service.start();

    await new Promise((r) => setTimeout(r, 80));
    expect(stalled).not.toHaveBeenCalled();
  });

  it("updateLastOutput resets stall detection", async () => {
    const stalled = vi.fn();
    bus.on("agent:stalled", stalled);

    service.trackAgent("agent_1", Date.now() - 200);
    service.updateLastOutput("agent_1");
    service.start();

    await new Promise((r) => setTimeout(r, 80));
    expect(stalled).not.toHaveBeenCalled();
  });

  it("untrackAgent stops stall detection for that agent", async () => {
    const stalled = vi.fn();
    bus.on("agent:stalled", stalled);

    service.trackAgent("agent_1", Date.now() - 200);
    service.untrackAgent("agent_1");
    service.start();

    await new Promise((r) => setTimeout(r, 80));
    expect(stalled).not.toHaveBeenCalled();
  });

  it("emits stall only once per agent per stall period", async () => {
    const stalled = vi.fn();
    bus.on("agent:stalled", stalled);

    service.trackAgent("agent_1", Date.now() - 200);
    service.start();

    // Wait for two check intervals
    await new Promise((r) => setTimeout(r, 130));
    expect(stalled).toHaveBeenCalledTimes(1);
  });

  it("stop() clears the interval", async () => {
    const stalled = vi.fn();
    bus.on("agent:stalled", stalled);

    service.trackAgent("agent_1", Date.now() - 200);
    service.start();
    service.stop();

    await new Promise((r) => setTimeout(r, 80));
    expect(stalled).not.toHaveBeenCalled();
  });

  it("onModuleDestroy calls stop()", () => {
    const stopSpy = vi.spyOn(service, "stop");
    service.onModuleDestroy();
    expect(stopSpy).toHaveBeenCalled();
  });

  it("tracks multiple agents independently", async () => {
    const stalled = vi.fn();
    bus.on("agent:stalled", stalled);

    service.trackAgent("agent_old", Date.now() - 200);
    service.trackAgent("agent_fresh", Date.now());
    service.start();

    await new Promise((r) => setTimeout(r, 80));
    expect(stalled).toHaveBeenCalledTimes(1);
    expect(stalled).toHaveBeenCalledWith(expect.objectContaining({ id: "agent_old" }));
  });
});
