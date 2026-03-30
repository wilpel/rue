import { describe, it, expect } from "vitest";
import { parseClientFrame, serializeDaemonFrame } from "../../src/gateway/protocol.js";

describe("protocol", () => {
  it("parses cmd frame", () => {
    const frame = parseClientFrame(JSON.stringify({ type: "cmd", id: "1", cmd: "ask", args: { text: "hello" } }));
    expect(frame.type).toBe("cmd");
    if (frame.type === "cmd") { expect(frame.cmd).toBe("ask"); expect(frame.args.text).toBe("hello"); }
  });

  it("parses subscribe frame", () => {
    const frame = parseClientFrame(JSON.stringify({ type: "subscribe", channels: ["agent:*"] }));
    expect(frame.type).toBe("subscribe");
  });

  it("rejects invalid frame", () => {
    expect(() => parseClientFrame(JSON.stringify({ type: "invalid" }))).toThrow();
  });

  it("serializes daemon frame", () => {
    const json = serializeDaemonFrame({ type: "ack", id: "1" });
    expect(JSON.parse(json)).toEqual({ type: "ack", id: "1" });
  });
});
