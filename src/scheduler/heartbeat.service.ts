import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { DelegateService } from "../agents/delegate.service.js";
import { MessageRepository } from "../memory/message.repository.js";
import { WorkspaceService } from "../memory/workspace.service.js";
import { TaskService } from "../tasks/task.service.js";
import { BusService } from "../bus/bus.service.js";
import { ConfigService } from "../config/config.service.js";
import { log } from "../shared/logger.js";

@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  private readonly intervalMs: number;
  private readonly enabled: boolean;

  constructor(
    @Inject(DelegateService) private readonly delegate: DelegateService,
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(WorkspaceService) private readonly workspace: WorkspaceService,
    @Inject(TaskService) private readonly tasks: TaskService,
    @Inject(BusService) private readonly bus: BusService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.intervalMs = config.heartbeat.intervalMs;
    this.enabled = config.heartbeat.enabled;
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    log.info(`[heartbeat] Started (interval: ${Math.round(this.intervalMs / 60_000)}min)`);
  }

  onModuleDestroy(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async tick(): Promise<void> {
    if (this.running) {
      log.info("[heartbeat] Skipping — previous heartbeat still running");
      return;
    }

    this.running = true;
    this.bus.emit("system:heartbeat", {});

    try {
      const history = this.messages.compactHistory({ limit: 10 });
      const activeTasks = this.tasks.listActive();
      const taskSummary = activeTasks.length > 0
        ? activeTasks.map(t => `- [${t.priority}] ${t.title} (${t.status}${t.due_at ? `, due ${new Date(t.due_at).toISOString()}` : ""})`).join("\n")
        : "No pending tasks.";

      const workspaceContext = this.workspace.toPromptText();

      const now = new Date();
      const prompt = [
        `Periodic check-in. Current time: ${now.toISOString()} (${now.toLocaleDateString("en-US", { weekday: "long" })})`,
        "",
        "## Pending Tasks",
        taskSummary,
        "",
        "## Recent Activity",
        history || "(no recent messages)",
        ...(workspaceContext ? ["", "## Current Awareness", workspaceContext] : []),
        "",
        "---",
        "Review pending tasks, recent activity, and current awareness signals. If anything needs attention, act on it.",
        "Save any important observations to memory via memory-save skill.",
        "If nothing needs attention, output a brief status note.",
      ].join("\n");

      await this.delegate.spawn(prompt, 0, undefined, {
        name: "Heartbeat",
        complexity: "low",
      });

      this.workspace.postSignal({ source: "heartbeat", type: "check-in", content: "Heartbeat completed", salience: 0.2, ttlMs: 600_000 });
      log.info("[heartbeat] Completed");
    } catch (err) {
      log.error(`[heartbeat] Failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.running = false;
    }
  }
}
