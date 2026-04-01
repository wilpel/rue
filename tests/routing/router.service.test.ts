import { describe, it, expect } from "vitest";
import { RouterService, type RouteRule, type AgentDef } from "../../src/routing/router.service.js";

describe("RouterService", () => {
  const agents: Record<string, AgentDef> = {
    default: { systemPrompt: "prompts/SYSTEM.md", personality: "prompts/PERSONALITY.md", tools: ["Bash"] },
    coder: { systemPrompt: "prompts/CODE.md", tools: ["Read", "Write", "Bash"] },
  };
  const inbound = (channelId: string, chatId: string) => ({ channelId, chatId, senderId: "u", messageId: "m", text: "", timestamp: 0 });

  it("matches exact channel + chatId", () => {
    const router = new RouterService([{ match: { channel: "telegram", chatId: "123" }, agent: "coder" }, { match: {}, agent: "default" }], agents);
    expect(router.resolve(inbound("telegram", "123")).agentId).toBe("coder");
  });

  it("falls through to catch-all", () => {
    const router = new RouterService([{ match: { channel: "discord" }, agent: "coder" }, { match: {}, agent: "default" }], agents);
    expect(router.resolve(inbound("telegram", "456")).agentId).toBe("default");
  });

  it("matches channel only", () => {
    const router = new RouterService([{ match: { channel: "discord" }, agent: "coder" }], agents);
    expect(router.resolve(inbound("discord", "999")).agentId).toBe("coder");
  });

  it("returns default when no routes", () => {
    const router = new RouterService([], agents);
    expect(router.resolve(inbound("telegram", "1")).agentId).toBe("default");
  });

  it("personality undefined when not set", () => {
    const router = new RouterService([{ match: {}, agent: "coder" }], agents);
    expect(router.resolve(inbound("telegram", "1")).personalityPath).toBeUndefined();
  });
});
