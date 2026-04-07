import { Injectable, Inject, OnModuleInit } from "@nestjs/common";
import { MessageRepository } from "../memory/message.repository.js";
import { AssemblerService } from "../memory/assembler.service.js";
import { DelegateService } from "../agents/delegate.service.js";
import { ClaudeProcessService } from "../agents/claude-process.service.js";
import { BusService } from "../bus/bus.service.js";
import { ChannelRegistry } from "./channel-registry.js";
import { RouterService } from "../routing/router.service.js";
import { ConfigService } from "../config/config.service.js";
import { SessionMaintenanceService } from "../database/session-maintenance.service.js";
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

  private readonly primaryModel: string;

  constructor(
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(AssemblerService) private readonly assembler: AssemblerService,
    @Inject(DelegateService) private readonly delegate: DelegateService,
    @Inject(ClaudeProcessService) private readonly processService: ClaudeProcessService,
    @Inject(BusService) private readonly bus: BusService,
    @Inject(ChannelRegistry) private readonly registry: ChannelRegistry,
    @Inject(RouterService) private readonly router: RouterService,
    @Inject(ConfigService) config: ConfigService,
    @Inject(SessionMaintenanceService) private readonly maintenance: SessionMaintenanceService,
  ) {
    this.primaryModel = config.models.primary;
  }

  onModuleInit(): void {
    this.bus.on("delegate:result", async ({ agentId, output, chatId }) => {
      // Skip CLI delegates — the gateway handles those
      const cid = String(chatId);
      if (!cid || cid === "0" || cid === "undefined" || cid.startsWith("cli-")) return;

      // Store delegate result in history, then trigger main agent to present it
      await this.messages.append({
        role: "channel", content: output,
        metadata: { tag: `AGENT_DELEGATE_${agentId}`, chatId: cid },
      });

      // Trigger main agent to relay the result — but with a constrained prompt
      // that prevents it from spawning more delegates
      const channelId = this.registry.listAdapters()[0] ?? "telegram";
      this.triggerDelegateFollowup(cid, channelId, agentId, output);
    });

    this.assembler.setDelegateService(this.delegate);
    this.maintenance.setDelegateSpawner(this.delegate);
    log.info("[channel] Service initialized");
  }

  /**
   * Receive a debounced batch of messages from a channel.
   * Persists each message and triggers the agent.
   */
  async handleBatch(batch: DebouncedBatch): Promise<void> {
    for (const msg of batch.messages) {
      await this.messages.append({
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
  async post(tag: string, content: string, chatId: string, extra?: Record<string, unknown>): Promise<void> {
    await this.messages.append({
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
   * Older messages are compacted (truncated) to save tokens.
   */
  async getHistory(chatId: string, limit = 20): Promise<string> {
    const result = await this.messages.compactHistory({ limit, chatId });
    return result || "(No conversation history)";
  }

  /**
   * Trigger main agent to present a delegate result. Uses a constrained prompt
   * that prevents spawning more delegates (breaks the feedback loop).
   */
  private triggerDelegateFollowup(chatId: string, channelId: string, agentId: string, output: string): void {
    // Use the same sequential processing queue
    if (this.processing.has(chatId)) {
      this.queued.set(chatId, channelId);
      return;
    }

    this.processing.add(chatId);
    this.runDelegateFollowup(chatId, channelId, agentId, output)
      .catch(err => log.error(`[channel] Delegate followup failed: ${err instanceof Error ? err.message : err}`))
      .finally(() => {
        this.processing.delete(chatId);
        const queuedChannelId = this.queued.get(chatId);
        if (queuedChannelId) {
          this.queued.delete(chatId);
          this.triggerAgent(chatId, queuedChannelId);
        }
      });
  }

  private async runDelegateFollowup(chatId: string, channelId: string, agentId: string, output: string): Promise<void> {
    const systemPrompt = await this.assembler.assemble("", undefined, "followup");
    const preview = output.length > 1500 ? output.slice(0, 1500) + "..." : output;

    const prompt = [
      `A background delegate agent (${agentId}) just finished and returned this result:`,
      "",
      preview,
      "",
      "---",
      "Present this result to the user. Format it nicely if needed. Output text = sent to Telegram.",
      "DO NOT delegate again. DO NOT spawn new agents. Just present the result.",
    ].join("\n");

    try {
      const { output: agentOutput } = await this.runClaudeQuery(prompt, systemPrompt, ["Bash"], undefined);
      const cleaned = agentOutput.replace(/\[no_?response\]/gi, "").trim();
      if (cleaned) {
        await this.messages.append({ role: "channel", content: cleaned, metadata: { tag: "AGENT_RUE", chatId } });
        await this.registry.sendMessage(channelId, { chatId }, cleaned);
        log.info(`[channel] Delegate followup responded (${cleaned.length} chars)`);
      }
    } catch (err) {
      log.error(`[channel] Delegate followup error: ${err instanceof Error ? err.message : err}`);
      // Fallback: send raw delegate output
      const cleaned = output.replace(/\[no_?response\]/gi, "").trim();
      if (cleaned) {
        await this.registry.sendMessage(channelId, { chatId }, cleaned).catch(() => {});
      }
    }
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

    const systemPrompt = await this.assembler.assemble("", {
      systemPrompt: route.systemPromptPath,
      personality: route.personalityPath,
    }, "dispatcher");

    // Get the latest user messages (what triggered this agent run)
    const recentMsgs = await this.messages.recentByChatId(chatId, 10);
    // Split into user messages and agent responses for cleaner context
    const userMessages = recentMsgs.filter(m => {
      const tag = (m.metadata as Record<string, unknown>)?.tag as string | undefined;
      return tag?.startsWith("USER");
    });
    const lastFewUserMsgs = userMessages.slice(-3);
    const latestUserMsg = lastFewUserMsgs[lastFewUserMsgs.length - 1];

    // Build a clean conversation context (last 6 messages for context, not full history)
    const contextMsgs = recentMsgs.slice(-6).map(m => {
      const tag = (m.metadata as Record<string, unknown>)?.tag as string | undefined;
      const role = tag?.startsWith("USER") ? "User" : "Rue";
      return `${role}: ${m.content}`;
    }).join("\n");

    const prompt = latestUserMsg
      ? `[Telegram message from chat_id=${chatId} message_id=${(latestUserMsg.metadata as Record<string, unknown>)?.messageId ?? ""}]\n\nConversation:\n${contextMsgs}\n\nThe user just said: "${latestUserMsg.content}"\n\nRespond naturally. Output text = sent to Telegram. Use Bash to run skills if needed.`
      : `Conversation:\n${contextMsgs}\n\nRespond to the latest message.`;

    log.info(`[channel] Triggering agent for chat ${chatId} (route: ${route.agentId})`);

    // Don't resume sessions — fresh context with explicit history prevents the agent
    // from thinking it already responded to messages it sees in the resumed session
    const resumeId = undefined;

    try {
      const { output } = await this.runClaudeQuery(prompt, systemPrompt, route.tools, resumeId);

      const cleaned = output.replace(/\[no_?response\]/gi, "").trim();
      if (cleaned) {
        await this.messages.append({ role: "channel", content: cleaned, metadata: { tag: "AGENT_RUE", chatId } });
        await this.registry.sendMessage(channelId, { chatId }, cleaned);
        log.info(`[channel] Agent responded (${cleaned.length} chars)`);
      } else if (output.match(/\[no_?response\]/i)) {
        const lastUserMsgId = await this.getLastUserMessageId(chatId);
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
  private async getLastUserMessageId(chatId: string): Promise<string | null> {
    const recent = await this.messages.recent(10);
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
      model: this.primaryModel,
      allowedTools: tools,
      resume: resumeSessionId,
    });

    const result = await proc.run();
    return { output: result.output, sessionId: result.sessionId };
  }
}
