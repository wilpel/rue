import { describe, it, expect } from "vitest";
import { ClaudeProcessService, ClaudeProcess } from "../../src/agents/claude-process.service.js";
import type { AgentConfig } from "../../src/agents/types.js";

const mockConfig: AgentConfig = {
  id: "agent_test",
  task: "do something",
  lane: "sub",
  workdir: "/tmp",
  systemPrompt: "you are a test agent",
  timeout: 5000,
};

describe("ClaudeProcessService", () => {
  it("createProcess returns a ClaudeProcess instance", () => {
    const service = new ClaudeProcessService();
    const proc = service.createProcess(mockConfig);
    expect(proc).toBeInstanceOf(ClaudeProcess);
  });

  it("each call creates a distinct ClaudeProcess", () => {
    const service = new ClaudeProcessService();
    const p1 = service.createProcess(mockConfig);
    const p2 = service.createProcess(mockConfig);
    expect(p1).not.toBe(p2);
  });

  it("new process is not running", () => {
    const service = new ClaudeProcessService();
    const proc = service.createProcess(mockConfig);
    expect(proc.isRunning).toBe(false);
    expect(proc.pid).toBeNull();
  });

  it("kill() does nothing when process is not running", () => {
    const service = new ClaudeProcessService();
    const proc = service.createProcess(mockConfig);
    expect(() => proc.kill()).not.toThrow();
  });

  it("onOutput registers callback", () => {
    const service = new ClaudeProcessService();
    const proc = service.createProcess(mockConfig);
    expect(() => proc.onOutput(() => {})).not.toThrow();
  });

  it("includes model in AgentConfig", () => {
    const config = { id: "t", task: "t", lane: "main" as const, workdir: "/tmp", systemPrompt: "t", timeout: 1000, model: "sonnet" };
    const service = new ClaudeProcessService();
    const proc = service.createProcess(config);
    expect(proc).toBeInstanceOf(ClaudeProcess);
  });

  it("runWithFailover returns result from first model on success", async () => {
    const service = new ClaudeProcessService();
    const mockResult = { output: "ok", exitCode: 0, cost: 0, durationMs: 10, model: "opus" };
    service.createProcess = (cfg: AgentConfig) => {
      const proc = new ClaudeProcess(cfg);
      proc.run = async () => ({ ...mockResult, model: cfg.model ?? "opus" });
      return proc;
    };
    const result = await service.runWithFailover(mockConfig, ["opus", "sonnet"]);
    expect(result.model).toBe("opus");
    expect(result.output).toBe("ok");
  });

  it("runWithFailover falls over to next model on retryable error", async () => {
    const service = new ClaudeProcessService();
    let callCount = 0;
    service.createProcess = (cfg: AgentConfig) => {
      const proc = new ClaudeProcess(cfg);
      proc.run = async () => {
        callCount++;
        if (callCount === 1) throw new Error("rate_limit exceeded");
        return { output: "fallback", exitCode: 0, cost: 0, durationMs: 10, model: cfg.model ?? "sonnet" };
      };
      return proc;
    };
    const emitted: unknown[] = [];
    const bus = { emit: (_ch: string, p: unknown) => { emitted.push(p); } };
    const result = await service.runWithFailover(mockConfig, ["opus", "sonnet"], bus);
    expect(result.model).toBe("sonnet");
    expect(result.output).toBe("fallback");
    expect(emitted).toHaveLength(1);
  });

  it("runWithFailover throws on non-retryable error", async () => {
    const service = new ClaudeProcessService();
    service.createProcess = (cfg: AgentConfig) => {
      const proc = new ClaudeProcess(cfg);
      proc.run = async () => { throw new Error("permission denied"); };
      return proc;
    };
    await expect(service.runWithFailover(mockConfig, ["opus", "sonnet"])).rejects.toThrow("permission denied");
  });
});
