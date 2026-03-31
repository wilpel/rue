import { Injectable, Inject, OnModuleInit } from "@nestjs/common";
import { InboxService, type InboxMessage } from "./inbox.service.js";
import { AssemblerService } from "../memory/assembler.service.js";
import { MessageRepository } from "../memory/message.repository.js";
import { TelegramService } from "../telegram/telegram.service.js";
import { log } from "../shared/logger.js";
import type { SDKSystemMessage, SDKStreamEvent, SDKAssistantMessage, SDKResultMessage } from "../shared/sdk-types.js";

/**
 * Processes inbox messages with batching and session continuity.
 *
 * Design:
 * - Telegram messages from the same chat are batched (2s window) so rapid
 *   messages get combined into one Claude query
 * - Queries run sequentially per chat (with session resume) so the agent
 *   has full conversation history
 * - Delegate/scheduler results bypass Claude — delivered directly
 * - Main agent has Bash-only + 4 turns: dispatches work, never blocks
 */
@Injectable()
export class InboxProcessorService implements OnModuleInit {
  private lastSessionId: string | undefined;
  private lastSessionTime = 0;

  // Batching: accumulate telegram messages per chat, flush after a pause
  private pendingBatches = new Map<number, { messages: InboxMessage[]; timer: ReturnType<typeof setTimeout> }>();
  private static readonly BATCH_WINDOW_MS = 2000;

  // Sequential processing per chat: queue + lock
  private chatQueues = new Map<number, Array<() => Promise<void>>>();
  private chatProcessing = new Set<number>();

  constructor(
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(AssemblerService) private readonly assembler: AssemblerService,
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(TelegramService) private readonly telegram: TelegramService,
  ) {}

  onModuleInit(): void {
    this.inbox.onMessage((msg) => {
      this.handle(msg).catch(err => {
        log.error(`[inbox-processor] Failed: ${err instanceof Error ? err.message : err}`);
      });
    });
  }

  private async handle(msg: InboxMessage): Promise<void> {
    switch (msg.source) {
      case "telegram":
        this.batchTelegramMessage(msg);
        break;
      case "delegate":
        await this.handleDelegateResult(msg);
        break;
      case "scheduler":
        await this.handleSchedulerResult(msg);
        break;
    }
  }

  /**
   * Batch telegram messages: wait 2s for more messages before processing.
   * This groups "i want an image" + "of playground dev" + "the office one"
   * into a single Claude query.
   */
  private batchTelegramMessage(msg: InboxMessage): void {
    const chatId = msg.metadata.chatId as number;

    let batch = this.pendingBatches.get(chatId);
    if (batch) {
      clearTimeout(batch.timer);
      batch.messages.push(msg);
    } else {
      batch = { messages: [msg], timer: null as unknown as ReturnType<typeof setTimeout> };
      this.pendingBatches.set(chatId, batch);
    }

    batch.timer = setTimeout(() => {
      this.pendingBatches.delete(chatId);
      this.enqueueChatWork(chatId, () => this.processTelegramBatch(chatId, batch!.messages));
    }, InboxProcessorService.BATCH_WINDOW_MS);
  }

  /**
   * Sequential queue per chat: ensures session resume works
   * (can't run two queries on the same session concurrently).
   */
  private enqueueChatWork(chatId: number, work: () => Promise<void>): void {
    let queue = this.chatQueues.get(chatId);
    if (!queue) { queue = []; this.chatQueues.set(chatId, queue); }
    queue.push(work);

    if (!this.chatProcessing.has(chatId)) {
      this.drainChatQueue(chatId);
    }
  }

  private async drainChatQueue(chatId: number): Promise<void> {
    this.chatProcessing.add(chatId);
    const queue = this.chatQueues.get(chatId);

    while (queue && queue.length > 0) {
      const work = queue.shift()!;
      try {
        await work();
      } catch (err) {
        log.error(`[inbox-processor] Chat ${chatId} work failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.chatProcessing.delete(chatId);
    this.chatQueues.delete(chatId);
  }

  /**
   * Process a batch of telegram messages as one Claude query.
   */
  private async processTelegramBatch(chatId: number, batch: InboxMessage[]): Promise<void> {
    // Combine messages into one prompt
    const combined = batch.map(m => m.content).join("\n");
    const firstMsg = batch[0];

    // Include chat_id and message_id from the LAST message (most recent)
    const lastMsg = batch[batch.length - 1];
    const msgId = lastMsg.metadata.messageId as number | undefined;

    log.info(`[inbox-processor] Processing batch (${batch.length} msg): "${combined.slice(0, 60)}"`);

    const systemPrompt = this.assembler.assemble(combined);

    // Build prompt with message context
    const chatIdStr = firstMsg.metadata.chatId;
    const messageIdStr = msgId ?? "";
    const prompt = `[Telegram message from chat_id=${chatIdStr} message_id=${messageIdStr}]\n${combined}`;

    const resumeId = (Date.now() - this.lastSessionTime < 1800_000) ? this.lastSessionId : undefined;

    try {
      const { output, sessionId } = await this.runClaudeQuery(prompt, systemPrompt, resumeId);

      if (sessionId) {
        this.lastSessionId = sessionId;
        this.lastSessionTime = Date.now();
      }

      const cleaned = output.replace(/\[no_?response\]/gi, "").trim();
      if (cleaned) {
        this.messages.append({ role: "assistant", content: cleaned });
        await this.telegram.sendMessage(chatId, cleaned);
        log.info(`[inbox-processor] Responded (${cleaned.length} chars)`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`[inbox-processor] Claude query failed: ${errMsg}`);

      if (resumeId) {
        this.lastSessionId = undefined;
        this.lastSessionTime = 0;
      }

      await this.telegram.sendMessage(chatId, "Something went wrong. Try again.").catch(() => {});
    }
  }

  private async handleDelegateResult(msg: InboxMessage): Promise<void> {
    const chatId = msg.metadata.chatId as number;
    if (!chatId) { log.info("[inbox-processor] Delegate result with no chatId — logged only"); return; }

    log.info(`[inbox-processor] Delivering delegate result to chat ${chatId}`);
    await this.telegram.sendMessage(chatId, msg.content);
  }

  private async handleSchedulerResult(msg: InboxMessage): Promise<void> {
    const chatId = msg.metadata.chatId as number | undefined;
    if (!chatId) { log.info("[inbox-processor] Scheduler result — logged only"); return; }
    await this.telegram.sendMessage(chatId, msg.content);
  }

  private async runClaudeQuery(
    prompt: string,
    systemPrompt: string,
    resumeSessionId?: string,
  ): Promise<{ output: string; sessionId?: string }> {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const abortController = new AbortController();
    const timeoutTimer = setTimeout(() => {
      if (!abortController.signal.aborted) abortController.abort();
    }, 60_000); // 60s timeout — main agent should be fast

    try {
      const q = query({
        prompt,
        options: {
          cwd: process.cwd(),
          systemPrompt,
          model: "opus",
          tools: ["Bash"],
          allowedTools: ["Bash"],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 4,
          abortController,
          includePartialMessages: true,
          settingSources: [],
          ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        },
      });

      let output = "";
      let sessionId: string | undefined;

      for await (const message of q) {
        switch (message.type) {
          case "system": {
            const sysMsg = message as SDKSystemMessage;
            if (sysMsg.subtype === "init" && sysMsg.session_id) {
              sessionId = sysMsg.session_id;
            }
            break;
          }
          case "stream_event": {
            const streamEvt = message as SDKStreamEvent;
            const event = streamEvt.event;
            if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
              output += event.delta.text;
            }
            break;
          }
          case "assistant": {
            const assistantMsg = message as SDKAssistantMessage;
            const fullText = assistantMsg.message.content
              .filter(b => b.type === "text")
              .map(b => (b as { type: "text"; text: string }).text)
              .join("");
            if (!output && fullText) output = fullText;
            break;
          }
          case "result": {
            const resultMsg = message as SDKResultMessage;
            if (resultMsg.session_id) sessionId = resultMsg.session_id;
            if (resultMsg.subtype === "success" && resultMsg.result) {
              output = resultMsg.result;
            }
            break;
          }
        }
      }

      return { output, sessionId };
    } finally {
      clearTimeout(timeoutTimer);
    }
  }
}
