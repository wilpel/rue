import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DaemonServer } from "../../src/daemon/server.js";
import WebSocket from "ws";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(({ prompt }: { prompt: string }) => {
    async function* mockQuery() {
      yield { type: "assistant", message: { id: "msg", type: "message", role: "assistant", content: [{ type: "text", text: `done: ${prompt}` }], usage: { input_tokens: 10, output_tokens: 5 } }, parent_tool_use_id: null, uuid: "u1", session_id: "s1" };
      yield { type: "result", subtype: "success", result: `done: ${prompt}`, total_cost_usd: 0.01, num_turns: 1, duration_ms: 50, duration_api_ms: 40, is_error: false, stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, modelUsage: {}, permission_denials: [], uuid: "u2", session_id: "s1" };
    }
    return mockQuery();
  }),
}));

vi.mock("../../src/agents/process.js", () => ({
  ClaudeProcess: vi.fn().mockImplementation(function (config: { task: string }) {
    return { pid: 99999, isRunning: false, onOutput: vi.fn(), run: vi.fn().mockResolvedValue({ output: `done: ${config.task}`, exitCode: 0, cost: 0.01, durationMs: 50 }), kill: vi.fn(), sendInput: vi.fn() };
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
