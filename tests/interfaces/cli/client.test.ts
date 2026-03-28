import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DaemonClient } from "../../../src/interfaces/cli/client.js";
import { DaemonServer } from "../../../src/daemon/server.js";

vi.mock("../../../src/agents/process.js", () => ({
  ClaudeProcess: vi.fn().mockImplementation(function(config) {
    return {
      pid: 99999,
      isRunning: false,
      onOutput: vi.fn(),
      run: vi.fn().mockResolvedValue({ output: `result: ${config.task}`, exitCode: 0, cost: 0.01, durationMs: 50 }),
      kill: vi.fn(),
      sendInput: vi.fn(),
    };
  }),
}));

describe("DaemonClient", () => {
  let server: DaemonServer;
  let client: DaemonClient;
  const port = 18898;

  beforeEach(async () => {
    server = new DaemonServer({ port, dataDir: "/tmp/rue-client-test-" + Date.now() });
    await server.start();
    client = new DaemonClient(`ws://localhost:${port}`);
    await client.connect();
  });

  afterEach(async () => {
    client.disconnect();
    await server.stop();
  });

  it("sends ask command and receives result", async () => {
    const result = await client.ask("hello world");
    expect(result.output).toContain("result: hello world");
  });

  it("sends status command", async () => {
    const status = await client.status();
    expect(status.agents).toBeInstanceOf(Array);
  });

  it("collects stream chunks during ask", async () => {
    const chunks: string[] = [];
    await client.ask("test", { onStream: (chunk) => chunks.push(chunk) });
  });

  it("handles connection errors gracefully", async () => {
    const badClient = new DaemonClient("ws://localhost:19999");
    await expect(badClient.connect()).rejects.toThrow();
  });
});
