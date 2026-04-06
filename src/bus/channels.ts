import type { Signal } from "../memory/workspace.types.js";

export interface BusChannels {
  "agent:spawned": { id: string; task: string; lane: string; model?: string; complexity?: string };
  "agent:progress": { id: string; chunk: string; tool?: string };
  "agent:completed": { id: string; result: string; cost: number; inputTokens?: number; outputTokens?: number };
  "agent:failed": { id: string; error: string; retryable: boolean };
  "agent:stalled": { id: string; lastOutputMs: number };
  "agent:killed": { id: string; reason: string };
  "task:created": { id: string; goal: string; nodeCount: number };
  "task:updated": { id: string; nodeId: string; status: string };
  "task:completed": { id: string; result: string };
  "memory:stored": { type: string; key: string };
  "memory:recalled": { type: string; query: string; resultCount: number };
  "identity:updated": { field: string; oldValue: unknown; newValue: unknown };
  "system:started": Record<string, never>;
  "system:shutdown": { reason: string };
  "system:health": { agents: number; queueDepth: number; memoryMb: number };
  "interface:input": { source: string; text: string };
  "interface:output": { target: string; text: string };
  "interface:stream": { agentId: string; chunk: string };
  "message:created": { id: string; role: string; content: string; timestamp: number; sessionId?: string; metadata?: Record<string, unknown> };
  "agent:failover": { id: string; fromModel: string; toModel: string; reason: string };
  "system:maintenance": { deletedMessages: number; deletedEvents: number };
  "system:heartbeat": Record<string, never>;
  "system:triage": Record<string, never>;
  "system:consolidation": Record<string, never>;
  "system:synthesis": Record<string, never>;
  "workspace:broadcast": { top: Signal[]; timestamp: number };
  "delegate:result": { agentId: string; output: string; chatId: string | number };
  "delegate:question": { agentId: string; question: string; chatId: string | number };
  "delegate:answer": { agentId: string; answer: string };
}

export type ChannelName = keyof BusChannels;
export type ChannelPayload<C extends ChannelName> = BusChannels[C];
