import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DaemonServer } from "../../src/daemon/server.js";
import WebSocket from "ws";

vi.mock("../../src/agents/process.js", () => ({
  ClaudeProcess: vi.fn().mockImplementation(function(config) {
    return {
      pid: 99999,
      isRunning: false,
      onOutput: vi.fn(),
      run: vi.fn().mockResolvedValue({ output: `done: ${config.task}`, exitCode: 0, cost: 0.01, durationMs: 50 }),
      kill: vi.fn(),
      sendInput: vi.fn(),
    };
  }),
}));

describe("DaemonServer", () => {
  let server: DaemonServer;
  const port = 18899;

  beforeEach(async () => {
    server = new DaemonServer({ port, dataDir: "/tmp/rue-test-" + Date.now() });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("accepts WebSocket connections", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });
    ws.close();
  });

  it("handles ask command and returns result", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));
    const messages: unknown[] = [];
    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
    ws.send(JSON.stringify({ type: "cmd", id: "f1", cmd: "ask", args: { text: "hello world" } }));
    await new Promise((r) => setTimeout(r, 200));
    expect(messages.some((m: any) => m.type === "ack" && m.id === "f1")).toBe(true);
    expect(messages.some((m: any) => m.type === "result" && m.id === "f1")).toBe(true);
    ws.close();
  });

  it("handles status command", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));
    const messages: unknown[] = [];
    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
    ws.send(JSON.stringify({ type: "cmd", id: "f2", cmd: "status", args: {} }));
    await new Promise((r) => setTimeout(r, 100));
    const result = messages.find((m: any) => m.type === "result" && m.id === "f2") as any;
    expect(result).toBeDefined();
    expect(result.data.agents).toBeInstanceOf(Array);
    ws.close();
  });

  it("returns error for unknown commands", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));
    const messages: unknown[] = [];
    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
    ws.send(JSON.stringify({ type: "cmd", id: "f3", cmd: "nonexistent", args: {} }));
    await new Promise((r) => setTimeout(r, 100));
    const error = messages.find((m: any) => m.type === "error" && m.id === "f3") as any;
    expect(error).toBeDefined();
    expect(error.code).toBe("UNKNOWN_CMD");
    ws.close();
  });
});
