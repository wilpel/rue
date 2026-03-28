export interface BusChannels {
  "agent:spawned": { id: string; task: string; lane: string };
  "agent:progress": { id: string; chunk: string; tool?: string };
  "agent:completed": { id: string; result: string; cost: number };
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
}

export type ChannelName = keyof BusChannels;
export type ChannelPayload<C extends ChannelName> = BusChannels[C];
