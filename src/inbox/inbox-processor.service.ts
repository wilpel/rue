import { Injectable, Inject, OnModuleInit } from "@nestjs/common";
import { InboxService, type InboxMessage } from "./inbox.service.js";
import { AssemblerService } from "../memory/assembler.service.js";
import { MessageRepository } from "../memory/message.repository.js";
import { TelegramService } from "../telegram/telegram.service.js";
import { log } from "../shared/logger.js";
import type { SDKStreamEvent, SDKAssistantMessage, SDKResultMessage } from "../shared/sdk-types.js";

/**
 * Processes all inbox messages by running the Claude agent and routing
 * responses back to the appropriate channel.
 *
 * Sources handled:
 * - telegram → runs Claude, sends response via TelegramService
 * - delegate → delegate results forwarded to the originating channel
 * - scheduler → scheduler results forwarded to the originating channel
 *
 * WS "ask" commands are NOT routed through the inbox processor — the
 * gateway handles those directly because they need real-time streaming.
 */
@Injectable()
export class InboxProcessorService implements OnModuleInit {
  private processing = false;
  private queue: InboxMessage[] = [];

  constructor(
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(AssemblerService) private readonly assembler: AssemblerService,
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(TelegramService) private readonly telegram: TelegramService,
  ) {}

  onModuleInit(): void {
    this.inbox.onMessage((msg) => this.enqueue(msg));
  }

  private enqueue(msg: InboxMessage): void {
    this.queue.push(msg);
    if (!this.processing) this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) { this.processing = false; return; }
    this.processing = true;

    const msg = this.queue.shift()!;
    try {
      await this.handle(msg);
    } catch (err) {
      log.error(`[inbox-processor] Failed to process ${msg.source} message: ${err instanceof Error ? err.message : err}`);
    }

    // Process next in queue
    this.processNext();
  }

  private async handle(msg: InboxMessage): Promise<void> {
    switch (msg.source) {
      case "telegram":
        await this.handleTelegram(msg);
        break;
      case "delegate":
        await this.handleDelegateResult(msg);
        break;
      case "scheduler":
        await this.handleSchedulerResult(msg);
        break;
      default:
        log.info(`[inbox-processor] Unhandled source: ${msg.source}`);
    }
  }

  /**
   * Telegram message: run Claude agent, send response back via Telegram.
   */
  private async handleTelegram(msg: InboxMessage): Promise<void> {
    const chatId = msg.metadata.chatId as number;
    const messageId = msg.metadata.messageId as number | undefined;
    const prefix = this.inbox.formatPrefix(msg.source);

    log.info(`[inbox-processor] Processing telegram message: "${msg.content.slice(0, 50)}"`);

    const systemPrompt = this.assembler.assemble(msg.content);
    const prompt = `${prefix} ${msg.content}`;

    try {
      const output = await this.runClaudeQuery(prompt, systemPrompt);
      const cleaned = output.replace(/\[no_?response\]/gi, "").trim();

      if (cleaned) {
        this.messages.append({ role: "assistant", content: cleaned });
        await this.telegram.sendMessage(chatId, cleaned, messageId);
        log.info(`[inbox-processor] Sent telegram response (${cleaned.length} chars)`);
      }
    } catch (err) {
      log.error(`[inbox-processor] Claude query failed: ${err instanceof Error ? err.message : err}`);
      await this.telegram.sendMessage(chatId, "Something went wrong. Try again.").catch(() => {});
    }
  }

  /**
   * Delegate result: forward to the channel that spawned it.
   */
  private async handleDelegateResult(msg: InboxMessage): Promise<void> {
    const chatId = msg.metadata.chatId as number;
    const messageId = msg.metadata.messageId as number | undefined;

    if (!chatId) {
      log.info(`[inbox-processor] Delegate result with no chatId — skipping telegram delivery`);
      return;
    }

    log.info(`[inbox-processor] Delivering delegate result to chat ${chatId} (${msg.content.length} chars)`);
    await this.telegram.sendMessage(chatId, msg.content, messageId);
  }

  /**
   * Scheduler result: if there's an associated chat, deliver it.
   */
  private async handleSchedulerResult(msg: InboxMessage): Promise<void> {
    const chatId = msg.metadata.chatId as number | undefined;
    if (!chatId) {
      log.info(`[inbox-processor] Scheduler result with no chatId — logged only`);
      return;
    }

    await this.telegram.sendMessage(chatId, msg.content);
  }

  /**
   * Run a Claude SDK query and return the final text output.
   */
  private async runClaudeQuery(prompt: string, systemPrompt: string): Promise<string> {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const abortController = new AbortController();
    const timeoutTimer = setTimeout(() => {
      if (!abortController.signal.aborted) abortController.abort();
    }, 300_000); // 5 min timeout

    try {
      const q = query({
        prompt,
        options: {
          cwd: process.cwd(),
          systemPrompt,
          model: "opus",
          tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
          allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          abortController,
          includePartialMessages: true,
          settingSources: [],
        },
      });

      let output = "";
      for await (const message of q) {
        switch (message.type) {
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
            if (resultMsg.subtype === "success" && resultMsg.result) {
              output = resultMsg.result;
            }
            break;
          }
        }
      }

      return output;
    } finally {
      clearTimeout(timeoutTimer);
    }
  }
}
