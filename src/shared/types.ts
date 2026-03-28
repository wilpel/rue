export type Lane = "main" | "sub" | "cron" | "skill";

export type AgentState =
  | "spawning"
  | "initializing"
  | "running"
  | "completing"
  | "cleanup"
  | "stalled"
  | "failed"
  | "killed";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type NotifySeverity = "info" | "notify" | "alert" | "urgent";

export interface TokenAllocation {
  identity: number;
  episodic: number;
  semantic: number;
  working: number;
  userModel: number;
  skills: number;
}
