import { describe, it, expect } from "vitest";
import { parseClientFrame, serializeDaemonFrame, type ClientFrame, type DaemonFrame } from "../../src/daemon/protocol.js";

describe("Protocol", () => {
  describe("parseClientFrame", () => {
    it("parses a cmd frame", () => {
      const raw = JSON.stringify({ type: "cmd", id: "f1", cmd: "ask", args: { text: "hello" } });
      const frame = parseClientFrame(raw);
      expect(frame).toEqual({ type: "cmd", id: "f1", cmd: "ask", args: { text: "hello" } });
    });

    it("parses a steer frame", () => {
      const raw = JSON.stringify({ type: "steer", agentId: "a1", message: "use bcrypt" });
      const frame = parseClientFrame(raw);
      expect(frame).toEqual({ type: "steer", agentId: "a1", message: "use bcrypt" });
    });

    it("parses a kill frame", () => {
      const raw = JSON.stringify({ type: "kill", agentId: "a1" });
      const frame = parseClientFrame(raw);
      expect(frame).toEqual({ type: "kill", agentId: "a1" });
    });

    it("parses a subscribe frame", () => {
      const raw = JSON.stringify({ type: "subscribe", channels: ["agent:*"] });
      const frame = parseClientFrame(raw);
      expect(frame).toEqual({ type: "subscribe", channels: ["agent:*"] });
    });

    it("throws on invalid JSON", () => {
      expect(() => parseClientFrame("not json")).toThrow();
    });

    it("throws on unknown frame type", () => {
      expect(() => parseClientFrame(JSON.stringify({ type: "unknown" }))).toThrow();
    });

    it("throws on missing required fields", () => {
      expect(() => parseClientFrame(JSON.stringify({ type: "cmd" }))).toThrow();
    });
  });

  describe("serializeDaemonFrame", () => {
    it("serializes an ack frame", () => {
      const frame: DaemonFrame = { type: "ack", id: "f1" };
      const result = JSON.parse(serializeDaemonFrame(frame));
      expect(result).toEqual({ type: "ack", id: "f1" });
    });

    it("serializes a stream frame", () => {
      const frame: DaemonFrame = { type: "stream", agentId: "a1", chunk: "hello" };
      const result = JSON.parse(serializeDaemonFrame(frame));
      expect(result.type).toBe("stream");
      expect(result.chunk).toBe("hello");
    });

    it("serializes an error frame", () => {
      const frame: DaemonFrame = { type: "error", id: "f1", code: "NOT_FOUND", message: "nope" };
      const result = JSON.parse(serializeDaemonFrame(frame));
      expect(result.code).toBe("NOT_FOUND");
    });
  });
});
