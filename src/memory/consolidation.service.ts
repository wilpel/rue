import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { DelegateService } from "../agents/delegate.service.js";
import { MessageRepository } from "./message.repository.js";
import { SemanticRepository } from "./semantic.repository.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";
import { IdentityService } from "../identity/identity.service.js";
import { UserModelService } from "../identity/user-model.service.js";
import { WorkspaceService } from "./workspace.service.js";
import { DatabaseService } from "../database/database.service.js";
import { BusService } from "../bus/bus.service.js";
import { ConfigService } from "../config/config.service.js";
import { log } from "../shared/logger.js";

@Injectable()
export class ConsolidationService implements OnModuleInit, OnModuleDestroy {
  private triageTimer: NodeJS.Timeout | null = null;
  private consolidationTimer: NodeJS.Timeout | null = null;
  private synthesisTimer: NodeJS.Timeout | null = null;
  private triageRunning = false;
  private consolidationRunning = false;
  private synthesisRunning = false;

  private readonly config: {
    triage: { enabled: boolean; intervalMs: number; minNewMessages: number };
    consolidation: { enabled: boolean; intervalMs: number };
    synthesis: { enabled: boolean; intervalMs: number };
  };

  constructor(
    @Inject(DelegateService) private readonly delegate: DelegateService,
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(SemanticRepository) private readonly semantic: SemanticRepository,
    @Inject(KnowledgeBaseService) private readonly kb: KnowledgeBaseService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(UserModelService) private readonly userModel: UserModelService,
    @Inject(WorkspaceService) private readonly workspace: WorkspaceService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(BusService) private readonly bus: BusService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.config = config.consolidation;
  }

  onModuleInit(): void {
    if (this.config.triage.enabled) {
      this.triageTimer = setInterval(() => this.triage(), this.config.triage.intervalMs);
      log.info(`[consolidation] Triage started (interval: ${Math.round(this.config.triage.intervalMs / 3_600_000)}h)`);
    }
    if (this.config.consolidation.enabled) {
      // Stagger start by 60s to avoid collisions
      setTimeout(() => {
        this.consolidationTimer = setInterval(() => this.consolidate(), this.config.consolidation.intervalMs);
        log.info(`[consolidation] Consolidation started (interval: ${Math.round(this.config.consolidation.intervalMs / 3_600_000)}h)`);
      }, 60_000);
    }
    if (this.config.synthesis.enabled) {
      setTimeout(() => {
        this.synthesisTimer = setInterval(() => this.synthesize(), this.config.synthesis.intervalMs);
        log.info(`[consolidation] Synthesis started (interval: ${Math.round(this.config.synthesis.intervalMs / 86_400_000)}d)`);
      }, 120_000);
    }
  }

  onModuleDestroy(): void {
    if (this.triageTimer) clearInterval(this.triageTimer);
    if (this.consolidationTimer) clearInterval(this.consolidationTimer);
    if (this.synthesisTimer) clearInterval(this.synthesisTimer);
  }

  private getWatermark(stage: string): number {
    const row = this.db.getDb().prepare(
      "SELECT processed_up_to FROM consolidation_log WHERE stage = ? ORDER BY created_at DESC LIMIT 1",
    ).get(stage) as { processed_up_to: number } | undefined;
    return row?.processed_up_to ?? 0;
  }

  private setWatermark(stage: string, upTo: number, result: string): void {
    this.db.getDb().prepare(
      "INSERT INTO consolidation_log (stage, processed_up_to, result, created_at) VALUES (?, ?, ?, ?)",
    ).run(stage, upTo, result, Date.now());
  }

  // Stage 1: Triage — classify messages, extract quick facts (haiku)
  async triage(): Promise<void> {
    if (this.triageRunning) return;
    this.triageRunning = true;
    this.bus.emit("system:triage", {});

    try {
      const watermark = this.getWatermark("triage");
      const rows = this.db.getDb().prepare(
        "SELECT id, content, metadata, created_at FROM messages WHERE created_at > ? ORDER BY created_at ASC LIMIT 100",
      ).all(watermark) as Array<{ id: string; content: string; metadata: string | null; created_at: number }>;

      if (rows.length < this.config.triage.minNewMessages) {
        log.info(`[consolidation] Triage skipped — only ${rows.length} new messages`);
        return;
      }

      const messageList = rows.map((r, i) => {
        const tag = r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>)?.tag ?? "MSG" : "MSG";
        return `${i}. [${tag}] (id:${r.id}) ${r.content.slice(0, 200)}`;
      }).join("\n");

      const prompt = [
        "TRIAGE: Classify these messages. For each, output a JSON line: {\"messageId\": \"...\", \"tag\": \"important\" or \"routine\", \"fact\": \"one-line fact or null\"}",
        "Important = decisions, preferences, people, project context, deadlines. Routine = greetings, acknowledgments, ephemeral chat.",
        "Output ONLY the JSON lines, no other text.",
        "",
        messageList,
      ].join("\n");

      await this.delegate.spawn(prompt, 0, undefined, { name: "Triage", complexity: "trivial" });

      // Note: delegate is fire-and-forget, we can't parse output here.
      // Instead, set watermark to latest message and let the delegate save facts via memory-save skill.
      const latestTs = rows[rows.length - 1].created_at;
      this.setWatermark("triage", latestTs, `Triaged ${rows.length} messages`);
      this.workspace.postSignal({ source: "consolidation", type: "triage-complete", content: `Triaged ${rows.length} messages`, salience: 0.3, ttlMs: 1_800_000 });
      log.info(`[consolidation] Triage completed — ${rows.length} messages processed`);
    } catch (err) {
      log.error(`[consolidation] Triage failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.triageRunning = false;
    }
  }

  // Stage 2: Consolidation — cross-reference, update KB and models (sonnet)
  async consolidate(): Promise<void> {
    if (this.consolidationRunning) return;
    this.consolidationRunning = true;
    this.bus.emit("system:consolidation", {});

    try {
      const watermark = this.getWatermark("consolidation");
      const recentMessages = this.messages.recent(50);
      const newMessages = recentMessages.filter(m => m.createdAt > watermark);

      if (newMessages.length < 3) {
        log.info(`[consolidation] Consolidation skipped — only ${newMessages.length} new messages`);
        return;
      }

      const history = newMessages.map(m => {
        const tag = (m.metadata as Record<string, unknown>)?.tag ?? (m.role === "assistant" ? "AGENT_RUE" : "USER");
        return `[${tag}] ${m.content}`;
      }).join("\n");

      const factsSummary = this.semantic.toPromptText(undefined, 30);
      const kbSummary = this.kb.toPromptText() ?? "No KB pages.";
      const identityText = this.identity.toPromptText();
      const userText = this.userModel.toPromptText();

      const prompt = [
        "CONSOLIDATION: Review recent conversations and cross-reference with existing knowledge.",
        "",
        "## Recent Conversations",
        history,
        "",
        "## Current Facts",
        factsSummary,
        "",
        "## Current KB",
        kbSummary,
        "",
        "## Identity",
        identityText,
        "",
        "## User Profile",
        userText,
        "",
        "---",
        "Instructions:",
        "1. Cross-reference conversations with existing KB and facts",
        "2. Update/create KB pages for recurring topics (memory-save skill: kb command)",
        "3. Save new facts (memory-save skill: fact command)",
        "4. Update user model if new preferences/expertise detected (memory-save skill: user command)",
        "5. Update identity if personality insights warranted (memory-save skill: identity command)",
        "6. Be SELECTIVE — only promote genuinely important information",
        "7. Output a brief summary of what you saved",
      ].join("\n");

      await this.delegate.spawn(prompt, 0, undefined, { name: "Consolidation", complexity: "medium" });

      const latestTs = newMessages[newMessages.length - 1].createdAt;
      this.setWatermark("consolidation", latestTs, `Consolidated ${newMessages.length} messages`);
      this.workspace.postSignal({ source: "consolidation", type: "consolidation-complete", content: `Consolidated ${newMessages.length} messages`, salience: 0.5, ttlMs: 3_600_000 });
      log.info(`[consolidation] Consolidation completed — ${newMessages.length} messages processed`);
    } catch (err) {
      log.error(`[consolidation] Consolidation failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.consolidationRunning = false;
    }
  }

  // Stage 3: Synthesis — form novel connections, generate insights (opus)
  async synthesize(): Promise<void> {
    if (this.synthesisRunning) return;
    this.synthesisRunning = true;
    this.bus.emit("system:synthesis", {});

    try {
      const factsSummary = this.semantic.toPromptText(undefined, 50);
      const kbSummary = this.kb.toPromptText() ?? "No KB pages.";
      const identityText = this.identity.toPromptText();
      const userText = this.userModel.toPromptText();

      // Get recent consolidation results for context
      const recentLogs = this.db.getDb().prepare(
        "SELECT stage, result, created_at FROM consolidation_log ORDER BY created_at DESC LIMIT 10",
      ).all() as Array<{ stage: string; result: string; created_at: number }>;
      const logSummary = recentLogs.map(l => `[${l.stage}] ${l.result}`).join("\n") || "No recent consolidation history.";

      const prompt = [
        "CREATIVE SYNTHESIS: Form novel connections between unrelated memories. Generate insights.",
        "",
        "## All Facts",
        factsSummary,
        "",
        "## Knowledge Base",
        kbSummary,
        "",
        "## Identity",
        identityText,
        "",
        "## User Profile",
        userText,
        "",
        "## Recent Consolidation Activity",
        logSummary,
        "",
        "---",
        "Instructions:",
        "1. Look for novel connections between unrelated memories and facts",
        "2. Generate hypotheses about the user's patterns, unstated preferences, or emerging themes",
        "3. Identify knowledge gaps that could be filled",
        "4. Save insights to KB under insights/ folder (memory-save skill: kb --path insights/<topic>)",
        "5. Update narrative identity if appropriate (memory-save skill: identity command)",
        "6. Output a brief summary of insights generated",
      ].join("\n");

      await this.delegate.spawn(prompt, 0, undefined, { name: "Synthesis", complexity: "hard" });

      this.setWatermark("synthesis", Date.now(), "Weekly synthesis completed");
      this.workspace.postSignal({ source: "consolidation", type: "synthesis-complete", content: "Weekly creative synthesis completed", salience: 0.7, ttlMs: 7_200_000 });
      log.info("[consolidation] Synthesis completed");
    } catch (err) {
      log.error(`[consolidation] Synthesis failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.synthesisRunning = false;
    }
  }
}
