import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../../src/bus/bus.js";
import type { BusChannels } from "../../src/bus/channels.js";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe("emit / on", () => {
    it("delivers events to subscribers", () => {
      const handler = vi.fn();
      bus.on("agent:spawned", handler);
      bus.emit("agent:spawned", { id: "a1", task: "test", lane: "sub" });
      expect(handler).toHaveBeenCalledWith({
        id: "a1",
        task: "test",
        lane: "sub",
      });
    });

    it("supports multiple subscribers on same channel", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      bus.on("agent:spawned", h1);
      bus.on("agent:spawned", h2);
      bus.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
      expect(h1).toHaveBeenCalledOnce();
      expect(h2).toHaveBeenCalledOnce();
    });

    it("does not deliver to unsubscribed handlers", () => {
      const handler = vi.fn();
      const unsub = bus.on("agent:spawned", handler);
      unsub();
      bus.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
      expect(handler).not.toHaveBeenCalled();
    });

    it("does not cross-deliver between channels", () => {
      const handler = vi.fn();
      bus.on("agent:completed", handler);
      bus.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("wildcard", () => {
    it("matches channel prefix with *", () => {
      const handler = vi.fn();
      bus.onWildcard("agent:*", handler);
      bus.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
      bus.emit("agent:completed", { id: "a1", result: "done", cost: 0.5 });
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("does not match unrelated channels", () => {
      const handler = vi.fn();
      bus.onWildcard("agent:*", handler);
      bus.emit("system:started", {});
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("request / reply", () => {
    it("resolves with handler response", async () => {
      bus.handle("memory:recalled", async (payload) => {
        return { results: [`found: ${payload.query}`] };
      });
      const result = await bus.request("memory:recalled", {
        type: "semantic",
        query: "test",
        resultCount: 0,
      });
      expect(result).toEqual({ results: ["found: test"] });
    });

    it("rejects if no handler registered", async () => {
      await expect(
        bus.request("memory:recalled", { type: "semantic", query: "test", resultCount: 0 }),
      ).rejects.toThrow("No handler registered");
    });

    it("rejects on timeout", async () => {
      bus.handle("memory:recalled", async () => {
        await new Promise((r) => setTimeout(r, 5000));
        return {};
      });
      await expect(
        bus.request(
          "memory:recalled",
          { type: "semantic", query: "test", resultCount: 0 },
          { timeoutMs: 50 },
        ),
      ).rejects.toThrow("timed out");
    });
  });

  describe("once", () => {
    it("fires handler only once then auto-unsubscribes", () => {
      const handler = vi.fn();
      bus.once("agent:completed", handler);
      bus.emit("agent:completed", { id: "a1", result: "done", cost: 0 });
      bus.emit("agent:completed", { id: "a2", result: "done2", cost: 0 });
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe("waitFor", () => {
    it("resolves when matching event fires", async () => {
      setTimeout(() => {
        bus.emit("agent:completed", { id: "a1", result: "done", cost: 0.1 });
      }, 10);
      const payload = await bus.waitFor("agent:completed", { timeoutMs: 1000 });
      expect(payload.id).toBe("a1");
    });

    it("rejects on timeout", async () => {
      await expect(bus.waitFor("agent:completed", { timeoutMs: 50 })).rejects.toThrow("timed out");
    });
  });
});
