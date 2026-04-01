import type { Lane } from "../shared/types.js";

export interface AgentConfig {
  id: string;
  task: string;
  lane: Lane;
  workdir: string;
  systemPrompt: string;
  timeout: number;
  maxTurns?: number;
  parentId?: string;
  budget?: number;
  allowedTools?: string[];
  model?: string;
  resume?: string;
}

export interface AgentHandle {
  id: string;
  config: AgentConfig;
  state: AgentProcessState;
  pid: number | null;
  startedAt: number;
  cost: number;
  lastOutputAt: number;
}

export type AgentProcessState =
  | "spawning"
  | "running"
  | "completed"
  | "failed"
  | "killed"
  | "stalled";

export interface SpawnResult {
  output: string;
  exitCode: number | null;
  cost: number;
  durationMs: number;
  sessionId?: string;
  numTurns?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
  model?: string;
}
