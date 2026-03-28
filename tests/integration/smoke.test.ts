import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DaemonServer } from "../../src/daemon/server.js";
import { DaemonClient } from "../../src/interfaces/cli/client.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("../../src/agents/process.js", () => ({
  ClaudeProcess: vi.fn().mockImplementation(function(config) {
    return {
      pid: 99999, isRunning: false,
      onOutput: vi.fn((cb) => { setTimeout(() => cb("Working on it...\n"), 5); }),
      run: vi.fn().mockResolvedValue({ output: `Completed: ${config.task}`, exitCode: 0, cost: 0.05, durationMs: 100 }),
      kill: vi.fn(), sendInput: vi.fn(),
    };
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
