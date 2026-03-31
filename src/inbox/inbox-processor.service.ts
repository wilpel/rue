import { Injectable, Inject, OnModuleInit } from "@nestjs/common";
import { InboxService, type InboxMessage } from "./inbox.service.js";
import { AssemblerService } from "../memory/assembler.service.js";
import { MessageRepository } from "../memory/message.repository.js";
import { TelegramService } from "../telegram/telegram.service.js";
import { log } from "../shared/logger.js";
import type { SDKSystemMessage, SDKStreamEvent, SDKAssistantMessage, SDKResultMessage } from "../shared/sdk-types.js";

/**
 * Processes inbox messages and routes responses.
 *
 * - Telegram user messages: run Claude (with session resume for history), send response
 * - Delegate/scheduler results: forward directly to Telegram (no Claude needed)
 *
 * Each message is handled concurrently — never blocks the thread.
 * Session continuity via Claude SDK resume gives the agent full conversation history.
 */
@Injectable()
export class InboxProcessorService implements OnModuleInit {
  private lastSessionId: string | undefined;
  private lastSessionTime = 0;

  constructor(
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(AssemblerService) private readonly assembler: AssemblerService,
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(TelegramService) private readonly telegram: TelegramService,
  ) {}

  onModuleInit(): void {
    this.inbox.onMessage((msg) => {
      // Fire-and-forget — never block the inbox
      this.handle(msg).catch(err => {
        log.error(`[inbox-processor] Failed: ${err instanceof Error ? err.message : err}`);
      });
    });
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

  private async handleTelegram(msg: InboxMessage): Promise<void> {
    const chatId = msg.metadata.chatId as number;

    log.info(`[inbox-processor] Processing: "${msg.content.slice(0, 50)}"`);

    const systemPrompt = this.assembler.assemble(msg.content);
    const prefix = this.inbox.formatPrefix(msg.source);
    const prompt = `${prefix} ${msg.content}`;

    // Resume existing session for conversation continuity
    const resumeId = (Date.now() - this.lastSessionTime < 1800_000) ? this.lastSessionId : undefined;

    try {
      const { output, sessionId } = await this.runClaudeQuery(prompt, systemPrompt, resumeId);

      // Track session for continuity
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

      // If session resume failed, clear session and try fresh on next message
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
    }, 300_000);

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
