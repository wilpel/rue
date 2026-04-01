import { Injectable, Inject, OnModuleInit } from "@nestjs/common";
import { MessageRepository } from "../memory/message.repository.js";
import { AssemblerService } from "../memory/assembler.service.js";
import { DelegateService } from "../agents/delegate.service.js";
import { ClaudeProcessService } from "../agents/claude-process.service.js";
import { BusService } from "../bus/bus.service.js";
import { ChannelRegistry } from "./channel-registry.js";
import { RouterService } from "../routing/router.service.js";
import type { DebouncedBatch } from "./debounce.service.js";
import type { InboundMessage } from "./channel-adapter.js";
import { log } from "../shared/logger.js";

/**
 * Adapter-agnostic conversation service. Receives debounced batches,
 * persists messages, triggers the main agent, and routes responses
 * back through the correct channel adapter.
 */
@Injectable()
export class ChannelService implements OnModuleInit {
  private processing = new Set<string>();
  private queued = new Map<string, string>(); // chatId -> channelId

  private lastSessionId: string | undefined;
  private lastSessionTime = 0;

  constructor(
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(AssemblerService) private readonly assembler: AssemblerService,
    @Inject(DelegateService) private readonly delegate: DelegateService,
    @Inject(ClaudeProcessService) private readonly processService: ClaudeProcessService,
    @Inject(BusService) private readonly bus: BusService,
    @Inject(ChannelRegistry) private readonly registry: ChannelRegistry,
    @Inject(RouterService) private readonly router: RouterService,
  ) {}

  onModuleInit(): void {
    this.bus.on("delegate:result", ({ agentId, output, chatId }) => {
      // Skip CLI delegates (chatId 0) — the gateway handles those
      if (!chatId || chatId === 0 || chatId === "0") return;
      this.post(`AGENT_DELEGATE_${agentId}`, output, String(chatId));
    });

    this.assembler.setDelegateService(this.delegate);
    log.info("[channel] Service initialized");
  }

  /**
   * Receive a debounced batch of messages from a channel.
   * Persists each message and triggers the agent.
   */
  handleBatch(batch: DebouncedBatch): void {
    for (const msg of batch.messages) {
      this.messages.append({
        role: "channel",
        content: msg.text,
        metadata: {
          tag: `USER_${msg.channelId.toUpperCase()}`,
          chatId: msg.chatId,
          messageId: msg.messageId,
        },
      });
    }
    this.triggerAgent(batch.chatId, batch.channelId);
  }

  /**
   * Post a message to the channel (used by delegate results and internal writes).
   * Triggers the main agent if it's not from the agent itself.
   */
  post(tag: string, content: string, chatId: string, extra?: Record<string, unknown>): void {
    this.messages.append({
      role: "channel",
      content,
      metadata: { tag, chatId, ...extra },
    });

    if (tag === "AGENT_RUE") return;

    // For internal posts (e.g. delegate results), trigger with a default channel.
    // The agent response will go through whatever adapter is available.
    const channelId = (extra?.channelId as string) ?? this.registry.listAdapters()[0] ?? "telegram";
    this.triggerAgent(chatId, channelId);
  }

  /**
   * Get last N messages from a chat, formatted as the conversation thread.
   */
  getHistory(chatId: string, limit = 20): string {
    const chatMessages = this.messages.recentByChatId(chatId, limit);
    if (chatMessages.length === 0) return "(No conversation history)";
    return chatMessages
      .map((m) => {
        const tag =
          (m.metadata as Record<string, unknown>)?.tag ??
          (m.role === "assistant" ? "AGENT_RUE" : "USER");
        return `[${tag}] ${m.content}`;
      })
      .join("\n");
  }

  /**
   * Trigger the main agent for a chat. Sequential per chat -- if already
   * processing, queue a re-trigger for when it's done.
   */
  private triggerAgent(chatId: string, channelId: string): void {
    if (this.processing.has(chatId)) {
      this.queued.set(chatId, channelId);
      return;
    }

    this.processing.add(chatId);
    this.runMainAgent(chatId, channelId)
      .catch((err) =>
        log.error(`[channel] Agent failed for chat ${chatId}: ${err instanceof Error ? err.message : err}`),
      )
      .finally(() => {
        this.processing.delete(chatId);
        const queuedChannelId = this.queued.get(chatId);
        if (queuedChannelId) {
          this.queued.delete(chatId);
          this.triggerAgent(chatId, queuedChannelId);
        }
      });
  }

  private async runMainAgent(chatId: string, channelId: string): Promise<void> {
    // Resolve route for this message context
    const routeMsg: InboundMessage = {
      channelId,
      chatId,
      senderId: "",
      messageId: "",
      text: "",
      timestamp: Date.now(),
    };
    const route = this.router.resolve(routeMsg);

    const history = this.getHistory(chatId, 20);
    const systemPrompt = this.assembler.assemble("", {
      systemPrompt: route.systemPromptPath,
      personality: route.personalityPath,
    });

    const prompt = `Here is the recent conversation on your channel:\n\n${history}\n\n---\nYour turn. Respond to the latest messages. Use Bash to run skills (delegate, telegram react, kb, etc). To send a message to the user, just output text — it will be sent to Telegram automatically.`;

    log.info(`[channel] Triggering agent for chat ${chatId} (route: ${route.agentId})`);

    const resumeId = Date.now() - this.lastSessionTime < 1800_000 ? this.lastSessionId : undefined;

    try {
      const { output, sessionId } = await this.runClaudeQuery(prompt, systemPrompt, route.tools, resumeId);

      if (sessionId) {
        this.lastSessionId = sessionId;
        this.lastSessionTime = Date.now();
      }

      const cleaned = output.replace(/\[no_?response\]/gi, "").trim();
      if (cleaned) {
        this.messages.append({ role: "channel", content: cleaned, metadata: { tag: "AGENT_RUE", chatId } });
        await this.registry.sendMessage(channelId, { chatId }, cleaned);
        log.info(`[channel] Agent responded (${cleaned.length} chars)`);
      } else if (output.match(/\[no_?response\]/i)) {
        const lastUserMsgId = this.getLastUserMessageId(chatId);
        if (lastUserMsgId) {
          await this.registry
            .sendReaction(channelId, { chatId }, lastUserMsgId, "\uD83D\uDC4D")
            .catch(err => log.warn(`[channel] Reaction failed: ${err instanceof Error ? err.message : err}`));
          log.info("[channel] No text response -- reacted with thumbs up");
        }
      } else {
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
        userMessage = "Timed out -- try again or simplify the request.";
      } else if (errMsg.includes("budget") || errMsg.includes("BUDGET")) {
        userMessage = "Daily budget limit reached. Try again tomorrow.";
      } else if (errMsg.includes("session") || errMsg.includes("resume")) {
        userMessage = "Session expired -- starting fresh. Try again.";
      } else {
        userMessage = "Something went wrong. Try again.";
      }

      await this.registry.sendMessage(channelId, { chatId }, userMessage).catch(err => log.warn(`[channel] Error message send failed: ${err instanceof Error ? err.message : err}`));
    }
  }

  /**
   * Find the messageId of the last user message on a chat (for reactions).
   */
  private getLastUserMessageId(chatId: string): string | null {
    const recent = this.messages.recent(10);
    const userMsgs = recent.filter(
      (m) =>
        (m.metadata as Record<string, unknown>)?.chatId === chatId &&
        typeof (m.metadata as Record<string, unknown>)?.tag === "string" &&
        ((m.metadata as Record<string, unknown>)?.tag as string).startsWith("USER_") &&
        (m.metadata as Record<string, unknown>)?.messageId,
    );
    if (userMsgs.length === 0) return null;
    return String((userMsgs[userMsgs.length - 1].metadata as Record<string, unknown>).messageId);
  }

  private async runClaudeQuery(
    prompt: string,
    systemPrompt: string,
    tools: string[],
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
      allowedTools: tools,
      resume: resumeSessionId,
    });

    const result = await proc.run();
    return { output: result.output, sessionId: result.sessionId };
  }
}
