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
});
