import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../../src/bus/bus.js";
import { applyMiddleware, type BusMiddleware } from "../../src/bus/middleware.js";

describe("Bus Middleware", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("intercepts emitted events", () => {
    const seen: string[] = [];
    const mw: BusMiddleware = {
      name: "logger",
      onEmit(channel, _payload) {
        seen.push(channel);
      },
    };
    const wrapped = applyMiddleware(bus, [mw]);
    wrapped.emit("system:started", {});
    expect(seen).toEqual(["system:started"]);
  });

  it("can transform event payloads", () => {
    const handler = vi.fn();
    const mw: BusMiddleware = {
      name: "enricher",
      onEmit(_channel, payload) {
        return { ...payload, enriched: true };
      },
    };
    const wrapped = applyMiddleware(bus, [mw]);
    wrapped.on("agent:spawned", handler);
    wrapped.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a1", enriched: true }),
    );
  });

  it("can suppress events by returning null", () => {
    const handler = vi.fn();
    const mw: BusMiddleware = {
      name: "filter",
      onEmit(channel) {
        if (channel === "system:health") return null;
      },
    };
    const wrapped = applyMiddleware(bus, [mw]);
    wrapped.on("system:health", handler);
    wrapped.emit("system:health", { agents: 0, queueDepth: 0, memoryMb: 0 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("chains multiple middleware in order", () => {
    const order: string[] = [];
    const mw1: BusMiddleware = {
      name: "first",
      onEmit() { order.push("first"); },
    };
    const mw2: BusMiddleware = {
      name: "second",
      onEmit() { order.push("second"); },
    };
    const wrapped = applyMiddleware(bus, [mw1, mw2]);
    wrapped.emit("system:started", {});
    expect(order).toEqual(["first", "second"]);
  });

  it("passes through non-emit operations unchanged", () => {
    const handler = vi.fn();
    const mw: BusMiddleware = { name: "noop" };
    const wrapped = applyMiddleware(bus, [mw]);
    wrapped.on("agent:spawned", handler);
    wrapped.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
    expect(handler).toHaveBeenCalledOnce();
  });
});
