import { describe, it, expect, vi, beforeEach } from "vitest";
import { BusService } from "../../src/bus/bus.service.js";

describe("BusService", () => {
  let bus: BusService;
  beforeEach(() => { bus = new BusService(); });

  it("delivers events to subscribers", () => {
    const handler = vi.fn();
    bus.on("agent:spawned", handler);
    bus.emit("agent:spawned", { id: "a1", task: "test", lane: "sub" });
    expect(handler).toHaveBeenCalledWith({ id: "a1", task: "test", lane: "sub" });
  });

  it("unsubscribes correctly", () => {
    const handler = vi.fn();
    const unsub = bus.on("agent:spawned", handler);
    unsub();
    bus.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("wildcard matches prefix", () => {
    const handler = vi.fn();
    bus.onWildcard("agent:*", handler);
    bus.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
    bus.emit("agent:completed", { id: "a1", result: "done", cost: 0 });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("once fires once then unsubscribes", () => {
    const handler = vi.fn();
    bus.once("agent:completed", handler);
    bus.emit("agent:completed", { id: "a1", result: "done", cost: 0 });
    bus.emit("agent:completed", { id: "a2", result: "done2", cost: 0 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("request/reply works", async () => {
    bus.handle("memory:recalled", async (payload) => {
      return { results: [`found: ${payload.query}`] };
    });
    const result = await bus.request("memory:recalled", { type: "semantic", query: "test", resultCount: 0 });
    expect(result).toEqual({ results: ["found: test"] });
  });

  it("request rejects on timeout", async () => {
    bus.handle("memory:recalled", async () => {
      await new Promise(r => setTimeout(r, 5000));
      return {};
    });
    await expect(bus.request("memory:recalled", { type: "semantic", query: "test", resultCount: 0 }, { timeoutMs: 50 })).rejects.toThrow("timed out");
  });

  it("waitFor resolves when event fires", async () => {
    setTimeout(() => bus.emit("agent:completed", { id: "a1", result: "done", cost: 0 }), 10);
    const payload = await bus.waitFor("agent:completed", { timeoutMs: 1000 });
    expect(payload.id).toBe("a1");
  });

  it("removeAllListeners clears everything", () => {
    const handler = vi.fn();
    bus.on("agent:spawned", handler);
    bus.onWildcard("agent:*", vi.fn());
    bus.removeAllListeners();
    bus.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
    expect(handler).not.toHaveBeenCalled();
  });
});
