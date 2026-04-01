import { Injectable, Inject } from "@nestjs/common";
import { ClaudeProcessService } from "./claude-process.service.js";
import { BusService } from "../bus/bus.service.js";
import { HealthService } from "./health.service.js";
import { log } from "../shared/logger.js";

export interface DelegateInfo {
  id: string;
  task: string;
  status: string;
  startedAt: number;
  result?: string;
  activity: string[];
  chatId: string | number;
  messageId?: string | number;
}

interface ActiveDelegate {
  info: DelegateInfo;
  abort: () => void;
}

@Injectable()
export class DelegateService {
  private delegates = new Map<string, DelegateInfo>();
  private activeDelegates = new Map<string, ActiveDelegate>();

  private static readonly TIMEOUT_MS = 600_000; // 10 min

  constructor(
    @Inject(ClaudeProcessService) private readonly processService: ClaudeProcessService,
    @Inject(BusService) private readonly bus: BusService,
    @Inject(HealthService) private readonly health: HealthService,
  ) {}

  async spawn(
    task: string,
    chatId: string | number,
    messageId?: string | number,
    opts?: { maxRetries?: number; name?: string },
  ): Promise<void> {
    const agentId = `delegate-${Date.now()}`;
    const displayName = opts?.name ?? task;
    const info: DelegateInfo = {
      id: agentId,
      task: displayName,
      status: "running",
      startedAt: Date.now(),
      activity: [],
      chatId,
      messageId,
    };
    this.delegates.set(agentId, info);

    this.bus.emit("agent:spawned", { id: agentId, task: displayName, lane: "sub" });
    this.health.trackAgent(agentId, Date.now());

    const systemPrompt = `You are a background worker agent for Rue. Complete the given task thoroughly using your tools. Output ONLY the final answer/result. Be concise but complete. Format for Telegram (plain text).`;

    const maxRetries = opts?.maxRetries ?? 0;
    let lastError: Error | undefined;

    let abortResolve: (() => void) | undefined;
    const abortPromise = new Promise<void>(resolve => { abortResolve = resolve; });
    const abort = () => { abortResolve?.(); };

    this.activeDelegates.set(agentId, { info, abort });

    const timeoutTimer = setTimeout(() => {
      log.warn(`[delegate] Agent ${agentId} timed out — killing`);
      abort();
    }, DelegateService.TIMEOUT_MS);

    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const proc = this.processService.createProcess({
          id: agentId,
          task,
          lane: "sub",
          workdir: process.cwd(),
          systemPrompt,
          timeout: DelegateService.TIMEOUT_MS,
          maxTurns: 25,
          allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"],
        });

        // Wrap proc.kill so that killing the process also resolves our abort promise
        const originalKill = proc.kill.bind(proc);
        proc.kill = () => {
          originalKill();
          abortResolve?.();
        };

        try {
          const result = await Promise.race([proc.run(), abortPromise.then(() => null)]);

          if (!result) {
            // Aborted — just clean up silently
            info.status = "failed";
            this.health.untrackAgent(agentId);
            return;
          }

          info.status = "completed";
          info.result = result.output.slice(0, 1000);
          log.info(`[delegate] Agent ${agentId} completed (${result.output.length} chars)`);

          if (result.output.trim()) {
            this.bus.emit("delegate:result", { agentId, output: result.output.trim(), chatId });
          }

          this.bus.emit("agent:completed", { id: agentId, result: result.output.slice(0, 200), cost: result.cost });
          this.health.untrackAgent(agentId);
          return; // Success — exit retry loop
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < maxRetries) {
            log.warn(`[delegate] Agent ${agentId} attempt ${attempt + 1} failed, retrying: ${lastError.message}`);
          }
        }
      }

      // All attempts exhausted
      const errMsg = lastError?.message ?? "unknown error";
      log.error(`[delegate] Agent ${agentId} failed after ${maxRetries + 1} attempts: ${errMsg}`);
      info.status = "failed";
      info.result = errMsg;

      this.bus.emit("delegate:result", { agentId, output: `Failed: ${errMsg}`, chatId });
      this.bus.emit("agent:failed", { id: agentId, error: errMsg, retryable: false });
      this.health.untrackAgent(agentId);
    } finally {
      clearTimeout(timeoutTimer);
      this.activeDelegates.delete(agentId);
      // Auto-cleanup old entries after 10 minutes
      setTimeout(() => this.delegates.delete(agentId), 600_000);
    }
  }

  listDelegates(): DelegateInfo[] {
    return Array.from(this.delegates.values()).map(info => ({ ...info }));
  }

  getDelegate(id: string): DelegateInfo | undefined {
    return this.delegates.get(id);
  }

  shutdown(): void {
    for (const { abort } of this.activeDelegates.values()) {
      abort();
    }
    this.activeDelegates.clear();
  }
}

