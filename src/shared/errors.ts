export class RueError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "RueError";
  }
}

export class AgentSpawnError extends RueError {
  constructor(message: string, retryable = false) {
    super(message, "AGENT_SPAWN_ERROR", retryable);
    this.name = "AgentSpawnError";
  }
}

export class AgentTimeoutError extends RueError {
  constructor(agentId: string) {
    super(`Agent ${agentId} timed out`, "AGENT_TIMEOUT", true);
    this.name = "AgentTimeoutError";
  }
}

export class DaemonNotRunningError extends RueError {
  constructor() {
    super("Daemon is not running. Start it with: rue daemon start", "DAEMON_NOT_RUNNING");
    this.name = "DaemonNotRunningError";
  }
}

export class LaneFullError extends RueError {
  constructor(lane: string) {
    super(`Lane "${lane}" is at capacity`, "LANE_FULL", true);
    this.name = "LaneFullError";
  }
}

export class BudgetExceededError extends RueError {
  constructor(agentId: string, spent: number, budget: number) {
    super(
      `Agent ${agentId} exceeded budget: $${spent.toFixed(2)} / $${budget.toFixed(2)}`,
      "BUDGET_EXCEEDED",
    );
    this.name = "BudgetExceededError";
  }
}
