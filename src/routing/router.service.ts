import { Injectable } from "@nestjs/common";
import type { InboundMessage } from "../channels/channel-adapter.js";

export interface RouteMatch { channel?: string; chatId?: string; chatType?: "direct" | "group"; }
export interface RouteRule { match: RouteMatch; agent: string; }
export interface AgentDef { systemPrompt: string; personality?: string; tools: string[]; }
export interface ResolvedRoute { agentId: string; systemPromptPath: string; personalityPath?: string; tools: string[]; }

@Injectable()
export class RouterService {
  constructor(private readonly rules: RouteRule[], private readonly agents: Record<string, AgentDef>) {}

  resolve(msg: InboundMessage): ResolvedRoute {
    for (const rule of this.rules) {
      if (this.matches(rule.match, msg)) return this.toRoute(rule.agent);
    }
    return this.toRoute("default");
  }

  private matches(match: RouteMatch, msg: InboundMessage): boolean {
    if (match.channel && match.channel !== msg.channelId) return false;
    if (match.chatId && match.chatId !== msg.chatId) return false;
    return true;
  }

  private toRoute(agentId: string): ResolvedRoute {
    const def = this.agents[agentId] ?? this.agents["default"];
    const resolvedId = this.agents[agentId] ? agentId : "default";
    return { agentId: resolvedId, systemPromptPath: def.systemPrompt, personalityPath: def.personality, tools: def.tools };
  }
}
