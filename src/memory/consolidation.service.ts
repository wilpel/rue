import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { DelegateService } from "../agents/delegate.service.js";
import { MessageRepository } from "./message.repository.js";
import { SemanticRepository } from "./semantic.repository.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";
import { IdentityService } from "../identity/identity.service.js";
import { UserModelService } from "../identity/user-model.service.js";
import { WorkspaceService } from "./workspace.service.js";
import { SupabaseService } from "../database/supabase.service.js";
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
    @Inject(SupabaseService) private readonly db: SupabaseService,
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

  private async getWatermark(stage: string): Promise<number> {
    const { data } = await this.db.from("consolidation_log")
      .select("processed_up_to")
      .eq("stage", stage)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    return (data?.processed_up_to as number) ?? 0;
  }

  private async setWatermark(stage: string, upTo: number, result: string): Promise<void> {
    await this.db.from("consolidation_log").insert({
      stage, processed_up_to: upTo, result, created_at: Date.now(),
    });
  }

  // Stage 1: Triage — classify messages, extract quick facts (haiku)
  async triage(): Promise<void> {
    if (this.triageRunning) return;
    this.triageRunning = true;
    this.bus.emit("system:triage", {});

    try {
      const watermark = await this.getWatermark("triage");
      const { data: rows } = await this.db.from("messages")
        .select("id, content, metadata, created_at")
        .gt("created_at", watermark)
        .order("created_at", { ascending: true })
        .limit(100);
      if (!rows) return;

      if (rows.length < this.config.triage.minNewMessages) {
        log.info(`[consolidation] Triage skipped — only ${rows.length} new messages`);
        return;
      }

      const messageList = rows.map((r: Record<string, unknown>, i: number) => {
        const meta = r.metadata as Record<string, unknown> | null;
        const tag = meta?.tag ?? "MSG";
        return `${i}. [${tag}] (id:${r.id}) ${(r.content as string).slice(0, 200)}`;
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
      const latestTs = rows[rows.length - 1].created_at as number;
      await this.setWatermark("triage", latestTs, `Triaged ${rows.length} messages`);
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
      const watermark = await this.getWatermark("consolidation");
      const recentMessages = await this.messages.recent(50);
      const newMessages = recentMessages.filter(m => m.createdAt > watermark);

      if (newMessages.length < 3) {
        log.info(`[consolidation] Consolidation skipped — only ${newMessages.length} new messages`);
        return;
      }

      const history = newMessages.map(m => {
        const tag = (m.metadata as Record<string, unknown>)?.tag ?? (m.role === "assistant" ? "AGENT_RUE" : "USER");
        return `[${tag}] ${m.content}`;
      }).join("\n");

      const factsSummary = await this.semantic.toPromptText(undefined, 30);
      const kbSummary = await this.kb.toPromptText() ?? "No KB pages.";
      const identityText = await this.identity.toPromptText();
      const userText = await this.userModel.toPromptText();

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
      await this.setWatermark("consolidation", latestTs, `Consolidated ${newMessages.length} messages`);
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
      const factsSummary = await this.semantic.toPromptText(undefined, 50);
      const kbSummary = await this.kb.toPromptText() ?? "No KB pages.";
      const identityText = await this.identity.toPromptText();
      const userText = await this.userModel.toPromptText();

      // Get recent consolidation results for context
      const { data: recentLogs } = await this.db.from("consolidation_log")
        .select("stage, result, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      const logSummary = (recentLogs ?? []).map((l: Record<string, unknown>) => `[${l.stage}] ${l.result}`).join("\n") || "No recent consolidation history.";

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

      await this.setWatermark("synthesis", Date.now(), "Weekly synthesis completed");
      this.workspace.postSignal({ source: "consolidation", type: "synthesis-complete", content: "Weekly creative synthesis completed", salience: 0.7, ttlMs: 7_200_000 });
      log.info("[consolidation] Synthesis completed");
    } catch (err) {
      log.error(`[consolidation] Synthesis failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.synthesisRunning = false;
    }
  }
}
