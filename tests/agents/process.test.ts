import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeProcess } from "../../src/agents/process.js";
import type { AgentConfig } from "../../src/agents/types.js";

// Mock the Claude Agent SDK
vi.mock("@anthropic-ai/claude-agent-sdk", () => {
  return {
    query: vi.fn(({ prompt }: { prompt: string }) => {
      // Return an async generator that yields SDK-like messages
      async function* mockQuery() {
        yield {
          type: "system",
          subtype: "init",
          session_id: "test-session-123",
          tools: [],
          model: "claude-sonnet-4-5-20250514",
          mcp_servers: [],
        };

        yield {
          type: "assistant",
          message: {
            id: "msg_test",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: `mock output for: ${prompt}` }],
            model: "claude-sonnet-4-5-20250514",
            usage: { input_tokens: 100, output_tokens: 50 },
          },
          parent_tool_use_id: null,
          uuid: "uuid-1",
          session_id: "test-session-123",
        };

        yield {
          type: "result",
          subtype: "success",
          result: `mock output for: ${prompt}`,
          total_cost_usd: 0.05,
          num_turns: 1,
          duration_ms: 100,
          duration_api_ms: 80,
          is_error: false,
          stop_reason: "end_turn",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          modelUsage: {},
          permission_denials: [],
          uuid: "uuid-2",
          session_id: "test-session-123",
        };
      }

      return mockQuery();
    }),
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

  it("spawns via SDK and resolves with output", async () => {
    const proc = new ClaudeProcess(baseConfig);
    const result = await proc.run();
    expect(result.output).toContain("mock output");
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("captures session ID from init message", async () => {
    const proc = new ClaudeProcess(baseConfig);
    await proc.run();
    expect(proc.sessionId).toBe("test-session-123");
  });

  it("reports cost from result message", async () => {
    const proc = new ClaudeProcess(baseConfig);
    const result = await proc.run();
    expect(result.cost).toBe(0.05);
  });

  it("reports token usage from result message", async () => {
    const proc = new ClaudeProcess(baseConfig);
    const result = await proc.run();
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
  });

  it("reports num turns", async () => {
    const proc = new ClaudeProcess(baseConfig);
    const result = await proc.run();
    expect(result.numTurns).toBe(1);
    expect(result.sessionId).toBe("test-session-123");
  });

  it("emits output chunks via onOutput callback", async () => {
    const chunks: string[] = [];
    const proc = new ClaudeProcess(baseConfig);
    proc.onOutput((chunk) => chunks.push(chunk));
    await proc.run();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.includes("mock output"))).toBe(true);
  });

  it("tracks running state", async () => {
    const proc = new ClaudeProcess(baseConfig);
    expect(proc.isRunning).toBe(false);
    const promise = proc.run();
    // isRunning is set synchronously before await
    await promise;
    expect(proc.isRunning).toBe(false);
  });

  it("can be killed via abort controller", async () => {
    // Override mock to simulate a long-running query
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    (query as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      async function* slowQuery() {
        yield {
          type: "system",
          subtype: "init",
          session_id: "slow-session",
          tools: [],
          model: "claude-sonnet-4-5-20250514",
          mcp_servers: [],
        };
        // Simulate a long wait that gets aborted
        await new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Aborted")), 5000);
        });
      }
      return slowQuery();
    });

    const proc = new ClaudeProcess(baseConfig);
    const promise = proc.run();

    // Give it a tick to start
    await new Promise((r) => setTimeout(r, 5));
    proc.kill();

    const result = await promise;
    // Kill causes an error catch, exitCode 1
    expect(result.exitCode).toBe(1);
    expect(proc.isRunning).toBe(false);
  });
});
