import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeProcess } from "../../src/agents/process.js";
import type { AgentConfig } from "../../src/agents/types.js";

// Mock child_process.spawn since we don't want to actually run Claude Code in tests
vi.mock("node:child_process", () => {
  const { EventEmitter } = require("node:events");
  const { Readable } = require("node:stream");

  function createMockProcess(exitCode = 0, output = "mock output") {
    const proc = new EventEmitter();
    proc.stdout = new Readable({ read() {} });
    proc.stderr = new Readable({ read() {} });
    proc.pid = 12345;
    proc.kill = vi.fn(() => {
      proc.emit("close", 1, "SIGTERM");
      return true;
    });

    setTimeout(() => {
      proc.stdout.push(output);
      proc.stdout.push(null);
      proc.stderr.push(null);
      proc.emit("close", exitCode, null);
    }, 10);

    return proc;
  }

  return {
    spawn: vi.fn(() => createMockProcess()),
  };
});

describe("ClaudeProcess", () => {
  const baseConfig: AgentConfig = {
    id: "agent_test123",
    task: "write a hello world",
    lane: "sub",
    workdir: "/tmp",
    systemPrompt: "You are a test agent.",
    timeout: 5000,
  };

  it("spawns and resolves with output", async () => {
    const proc = new ClaudeProcess(baseConfig);
    const result = await proc.run();
    expect(result.output).toBe("mock output");
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("exposes pid after spawn", async () => {
    const proc = new ClaudeProcess(baseConfig);
    const promise = proc.run();
    expect(proc.pid).toBe(12345);
    await promise;
  });

  it("emits output chunks via onOutput callback", async () => {
    const chunks: string[] = [];
    const proc = new ClaudeProcess(baseConfig);
    proc.onOutput((chunk) => chunks.push(chunk));
    await proc.run();
    expect(chunks).toContain("mock output");
  });

  it("can be killed", async () => {
    const proc = new ClaudeProcess(baseConfig);
    const promise = proc.run();
    proc.kill();
    const result = await promise;
    expect(result.exitCode).toBe(1);
  });

  it("tracks running state", async () => {
    const proc = new ClaudeProcess(baseConfig);
    expect(proc.isRunning).toBe(false);
    const promise = proc.run();
    expect(proc.isRunning).toBe(true);
    await promise;
    expect(proc.isRunning).toBe(false);
  });
});
