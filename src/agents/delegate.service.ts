import { Injectable, Inject } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import { ClaudeProcessService } from "./claude-process.service.js";
import { BusService } from "../bus/bus.service.js";
import { HealthService } from "./health.service.js";
import { ConfigService } from "../config/config.service.js";
import type { Complexity } from "./types.js";
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
  private pendingQuestions = new Map<string, string>();   // agentId -> question
  private pendingAnswers = new Map<string, string>();     // agentId -> answer

  private static readonly TIMEOUT_MS = 600_000; // 10 min

  constructor(
    @Inject(ClaudeProcessService) private readonly processService: ClaudeProcessService,
    @Inject(BusService) private readonly bus: BusService,
    @Inject(HealthService) private readonly health: HealthService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private resolveModel(complexity: Complexity): string {
    return this.config.models.delegate[complexity];
  }

  async spawn(
    task: string,
    chatId: string | number,
    messageId?: string | number,
    opts?: { maxRetries?: number; name?: string; complexity?: Complexity },
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

    const complexity = opts?.complexity ?? "medium";
    const model = this.resolveModel(complexity);

    log.info(`[delegate] Spawning ${agentId} complexity=${complexity} model=${model} task="${displayName.slice(0, 60)}"`);
    this.bus.emit("agent:spawned", { id: agentId, task: displayName, lane: "sub", model, complexity });
    this.health.trackAgent(agentId, Date.now());

    const systemPrompt = this.buildDelegatePrompt(agentId);

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
          model,
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

  postQuestion(agentId: string, question: string): void {
    this.pendingQuestions.set(agentId, question);
    const info = this.delegates.get(agentId);
    const chatId = info?.chatId ?? 0;
    this.bus.emit("delegate:question", { agentId, question, chatId });
    log.info(`[delegate] Agent ${agentId} asked: ${question.slice(0, 80)}`);
  }

  postAnswer(agentId: string, answer: string): void {
    this.pendingAnswers.set(agentId, answer);
    this.pendingQuestions.delete(agentId);
    this.bus.emit("delegate:answer", { agentId, answer });
    log.info(`[delegate] Agent ${agentId} answered: ${answer.slice(0, 80)}`);
  }

  getAnswer(agentId: string): string | undefined {
    const answer = this.pendingAnswers.get(agentId);
    if (answer) this.pendingAnswers.delete(agentId);  // consume once
    return answer;
  }

  getPendingQuestion(agentId: string): string | undefined {
    return this.pendingQuestions.get(agentId);
  }

  private buildDelegatePrompt(agentId: string): string {
    // Static instructions first (cache-friendly), dynamic agent ID last
    const sections: string[] = [];

    sections.push("Background worker for Rue. Complete task thoroughly. Output ONLY final answer. Concise but complete.");
    sections.push("\n## Writing Style");
    sections.push("Write like a real person. No em dashes. No 'delve/tapestry/landscape/leverage/robust/comprehensive/streamline'. No 'It\\'s worth noting' or 'Let\\'s dive in'. No hedging everything with 'may/might/could'. Be specific (numbers, names, dates). State opinions directly. Vary sentence length. Use fragments. Be uneven and human, not polished and uniform.");
    sections.push("\n## Memory Persistence");
    sections.push("Save important info to long-term memory via memory-save skill. People, decisions, preferences, project context = save. Ephemeral chat = skip.");
    sections.push("\n## Auto-Skill Creation");
    sections.push("If your task involved a reusable pattern (API integration, data transform, automation) and no existing skill covers it, create a new skill:");
    sections.push("1. Read `docs/how-to-create-skills.md` first");
    sections.push("2. Create `skills/<name>/SKILL.md`, `skills/<name>/run.ts`, `skills/<name>/metadata.json`");
    sections.push("Only create skills for genuinely reusable patterns, not one-off tasks.");

    // Skills (semi-static, changes rarely)
    const skillsDir = path.join(process.cwd(), "skills");
    if (fs.existsSync(skillsDir)) {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      const skills: Array<{ name: string; description: string }> = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
        if (!fs.existsSync(skillMd)) continue;
        const content = fs.readFileSync(skillMd, "utf-8");
        const lines = content.split("\n");
        let description = "";
        let foundHeading = false;
        for (const line of lines) {
          if (line.startsWith("# ")) { foundHeading = true; continue; }
          if (foundHeading && line.trim()) { description = line.trim(); break; }
        }
        skills.push({ name: entry.name, description });
      }
      if (skills.length > 0) {
        sections.push("\n## Skills");
        for (const skill of skills) {
          sections.push(`- **${skill.name}**: ${skill.description}`);
        }
        sections.push("\nRun: `node --import tsx/esm skills/<name>/run.ts <command> [args]`");
      }
    }

    // Dynamic: agent ID injected last
    sections.push(`\n## Agent ID: ${agentId}`);
    sections.push(`Need clarification? Ask:`);
    sections.push(`\`node --import tsx/esm skills/delegate-ask/run.ts --agent-id "${agentId}" --question "question"\``);
    sections.push("Only ask when genuinely stuck. No unnecessary questions.");

    return sections.join("\n");
  }

  shutdown(): void {
    for (const { abort } of this.activeDelegates.values()) {
      abort();
    }
    this.activeDelegates.clear();
  }
}

