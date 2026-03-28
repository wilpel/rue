import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DaemonServer } from "../../src/daemon/server.js";
import { DaemonClient } from "../../src/interfaces/cli/client.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(({ prompt }: { prompt: string }) => {
    async function* mockQuery() {
      yield { type: "assistant", message: { id: "msg", type: "message", role: "assistant", content: [{ type: "text", text: `Completed: ${prompt}` }], usage: { input_tokens: 10, output_tokens: 5 } }, parent_tool_use_id: null, uuid: "u1", session_id: "s1" };
      yield { type: "result", subtype: "success", result: `Completed: ${prompt}`, total_cost_usd: 0.05, num_turns: 1, duration_ms: 100, duration_api_ms: 80, is_error: false, stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, modelUsage: {}, permission_denials: [], uuid: "u2", session_id: "s1" };
    }
    return mockQuery();
  }),
}));

vi.mock("../../src/agents/process.js", () => ({
  ClaudeProcess: vi.fn().mockImplementation(function (config: { task: string }) {
    return { pid: 99999, isRunning: false, onOutput: vi.fn(), run: vi.fn().mockResolvedValue({ output: `Completed: ${config.task}`, exitCode: 0, cost: 0.05, durationMs: 100 }), kill: vi.fn(), sendInput: vi.fn() };
  }),
}));

describe("Integration: Full Stack Smoke Test", () => {
  let server: DaemonServer;
  let client: DaemonClient;
  let tmpDir: string;
  const port = 18897;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-integration-"));
    server = new DaemonServer({ port, dataDir: tmpDir });
    await server.start();
    client = new DaemonClient(`ws://localhost:${port}`);
    await client.connect();
  });

  afterEach(async () => {
    client.disconnect();
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("full flow: ask → stream → result", async () => {
    const streams: string[] = [];
    const result = await client.ask("write a hello world function", {
      onStream: (chunk) => streams.push(chunk),
    });
    expect(result.output).toContain("Completed");
    expect(result.output).toContain("hello world");
  });

  it("status returns empty agents when idle", async () => {
    const status = await client.status();
    expect(status.agents).toEqual([]);
  });

  it("handles multiple sequential asks", async () => {
    const r1 = await client.ask("task one");
    const r2 = await client.ask("task two");
    expect(r1.output).toContain("task one");
    expect(r2.output).toContain("task two");
  });

  it("data directory is populated after operations", async () => {
    await client.ask("test task");
    expect(fs.existsSync(path.join(tmpDir, "events"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "memory", "semantic"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "identity"))).toBe(true);
  });
});
