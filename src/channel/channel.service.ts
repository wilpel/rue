import { Injectable, Inject, OnModuleInit, forwardRef } from "@nestjs/common";
import { MessageRepository } from "../memory/message.repository.js";
import { AssemblerService } from "../memory/assembler.service.js";
import { TelegramService } from "../telegram/telegram.service.js";
import { DelegateService } from "../agents/delegate.service.js";
import { ClaudeProcessService } from "../agents/claude-process.service.js";
import { BusService } from "../bus/bus.service.js";
import { log } from "../shared/logger.js";

export interface ChannelMessage {
  tag: string;
  content: string;
  timestamp: number;
}

/**
 * Single shared conversation channel. All participants write here:
 * - USER_TELEGRAM: user messages from Telegram
 * - AGENT_RUE: main agent responses
 * - AGENT_DELEGATE_<id>: delegate agent results
 *
 * On new messages: batch 2s, trigger main agent with last 20 messages as context.
 * Main agent responds, response gets written to channel + sent to Telegram.
 */
@Injectable()
export class ChannelService implements OnModuleInit {
  private batchTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private batchedMessages = new Map<number, Array<{ tag: string; content: string }>>();
  private processing = new Set<number>(); // chats currently being processed
  private queued = new Map<number, boolean>(); // chats with queued trigger

  private lastSessionId: string | undefined;
  private lastSessionTime = 0;

  private static readonly BATCH_MS = 2000;

  constructor(
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(AssemblerService) private readonly assembler: AssemblerService,
    @Inject(forwardRef(() => TelegramService)) private readonly telegram: TelegramService,
    @Inject(DelegateService) private readonly delegate: DelegateService,
    @Inject(ClaudeProcessService) private readonly processService: ClaudeProcessService,
    @Inject(BusService) private readonly bus: BusService,
  ) {}

  onModuleInit(): void {
    // Listen for delegate results via bus (decoupled from DelegateService)
    this.bus.on("delegate:result", ({ agentId, output, chatId }) => {
      this.post(`AGENT_DELEGATE_${agentId}`, output, chatId);
    });

    this.assembler.setDelegateService(this.delegate);
    log.info("[channel] Service initialized");
  }

  /**
   * Post a message to the channel. Triggers the main agent if it's from
   * a user or delegate (not from the agent itself).
   */
  post(tag: string, content: string, chatId: number, extra?: Record<string, unknown>): void {
    // Store in DB
    this.messages.append({
      role: "channel",
      content,
      metadata: { tag, chatId, ...extra },
    });

    // Don't trigger agent for its own messages
    if (tag === "AGENT_RUE") return;

    // Batch: accumulate messages, flush after 2s pause
    let batch = this.batchedMessages.get(chatId);
    if (!batch) { batch = []; this.batchedMessages.set(chatId, batch); }
    batch.push({ tag, content });

    const existingTimer = this.batchTimers.get(chatId);
    if (existingTimer) clearTimeout(existingTimer);

    this.batchTimers.set(chatId, setTimeout(() => {
      this.batchTimers.delete(chatId);
      this.batchedMessages.delete(chatId);
      this.triggerAgent(chatId);
    }, ChannelService.BATCH_MS));
  }

  /**
   * Get last N messages from a chat, formatted as the conversation thread.
   */
  getHistory(chatId: number, limit = 20): string {
    const chatMessages = this.messages.recentByChatId(chatId, limit);
    if (chatMessages.length === 0) return "(No conversation history)";
    return chatMessages.map(m => {
      const tag = (m.metadata as Record<string, unknown>)?.tag ?? (m.role === "assistant" ? "AGENT_RUE" : "USER_TELEGRAM");
      return `[${tag}] ${m.content}`;
    }).join("\n");
  }

  /**
   * Trigger the main agent for a chat. Sequential per chat — if already
   * processing, queue a re-trigger for when it's done.
   */
  private triggerAgent(chatId: number): void {
    if (this.processing.has(chatId)) {
      this.queued.set(chatId, true);
      return;
    }

    this.processing.add(chatId);
    this.runMainAgent(chatId)
      .catch(err => log.error(`[channel] Agent failed for chat ${chatId}: ${err instanceof Error ? err.message : err}`))
      .finally(() => {
        this.processing.delete(chatId);
        // If new messages arrived while processing, trigger again
        if (this.queued.get(chatId)) {
          this.queued.delete(chatId);
          this.triggerAgent(chatId);
        }
      });
  }

  private async runMainAgent(chatId: number): Promise<void> {
    const history = this.getHistory(chatId, 20);
    const systemPrompt = this.assembler.assemble("");

    const prompt = `Here is the recent conversation on your channel:\n\n${history}\n\n---\nYour turn. Respond to the latest messages. Use Bash to run skills (delegate, telegram react, kb, etc). To send a message to the user, just output text — it will be sent to Telegram automatically.`;

    log.info(`[channel] Triggering agent for chat ${chatId}`);

    const resumeId = (Date.now() - this.lastSessionTime < 1800_000) ? this.lastSessionId : undefined;

    try {
      const { output, sessionId } = await this.runClaudeQuery(prompt, systemPrompt, resumeId);

      if (sessionId) {
        this.lastSessionId = sessionId;
        this.lastSessionTime = Date.now();
      }

      const cleaned = output.replace(/\[no_?response\]/gi, "").trim();
      if (cleaned) {
        // Agent had text — post it
        this.messages.append({ role: "channel", content: cleaned, metadata: { tag: "AGENT_RUE", chatId } });
        await this.telegram.sendMessage(chatId, cleaned);
        log.info(`[channel] Agent responded (${cleaned.length} chars)`);
      } else if (output.match(/\[no_?response\]/i)) {
        // Agent explicitly chose no_response — thumbs up is appropriate
        const lastUserMsgId = this.getLastUserMessageId(chatId);
        if (lastUserMsgId) {
          await this.telegram.reactToMessage(chatId, lastUserMsgId, "👍").catch(() => {});
          log.info(`[channel] No text response — reacted with 👍`);
        }
      } else {
        // Empty output with no [no_response] marker — something unexpected
        log.warn(`[channel] Agent produced empty output for chat ${chatId}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`[channel] Claude query failed: ${errMsg}`);

      if (resumeId) {
        this.lastSessionId = undefined;
        this.lastSessionTime = 0;
      }

      let userMessage: string;
      if (errMsg.includes("abort") || errMsg.includes("timeout")) {
        userMessage = "Timed out — try again or simplify the request.";
      } else if (errMsg.includes("budget") || errMsg.includes("BUDGET")) {
        userMessage = "Daily budget limit reached. Try again tomorrow.";
      } else if (errMsg.includes("session") || errMsg.includes("resume")) {
        userMessage = "Session expired — starting fresh. Try again.";
      } else {
        userMessage = "Something went wrong. Try again.";
      }

      await this.telegram.sendMessage(chatId, userMessage).catch(() => {});
    }
  }

  /**
   * Find the messageId of the last user message on a chat (for reactions).
   */
  private getLastUserMessageId(chatId: number): number | null {
    const recent = this.messages.recent(10);
    const userMsgs = recent.filter(m =>
      (m.metadata as any)?.chatId === chatId &&
      (m.metadata as any)?.tag === "USER_TELEGRAM" &&
      (m.metadata as any)?.messageId
    );
    if (userMsgs.length === 0) return null;
    return (userMsgs[userMsgs.length - 1].metadata as any).messageId as number;
  }

  private async runClaudeQuery(
    prompt: string,
    systemPrompt: string,
    resumeSessionId?: string,
  ): Promise<{ output: string; sessionId?: string }> {
    const proc = this.processService.createProcess({
      id: `channel-${Date.now()}`,
      task: prompt,
      lane: "main",
      workdir: process.cwd(),
      systemPrompt,
      timeout: 60_000,
      maxTurns: 4,
      allowedTools: ["Bash"],
      resume: resumeSessionId,
    });

    const result = await proc.run();
    return { output: result.output, sessionId: result.sessionId };
  }
}
