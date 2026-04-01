import type { ChannelAdapter, ChannelCapability, ChannelTarget, SendOptions, SentMessage, InboundMessage } from "../channel-adapter.js";
import { log } from "../../shared/logger.js";

type MessageHandler = (msg: InboundMessage) => void;
type ResponseHandler = (chatId: string, text: string) => void;

/**
 * CLI channel adapter. Unlike Telegram (which connects to an external service),
 * the CLI adapter is an in-process bridge: the WebSocket gateway pushes messages
 * in via injectMessage(), and responses are delivered via onResponse callbacks.
 *
 * Each WebSocket connection gets a unique chatId (e.g., "cli-<timestamp>").
 */
export class CliAdapter implements ChannelAdapter {
  readonly id = "cli";
  readonly capabilities = new Set<ChannelCapability>([]);

  private messageHandlers: MessageHandler[] = [];
  private responseHandlers: ResponseHandler[] = [];

  async start(): Promise<void> {
    log.info("[cli] Adapter started");
  }

  async stop(): Promise<void> {
    log.info("[cli] Adapter stopped");
  }

  /**
   * Called by the WebSocket gateway to inject a user message into the channel pipeline.
   */
  injectMessage(chatId: string, text: string, senderId?: string): void {
    const msg: InboundMessage = {
      channelId: "cli",
      chatId,
      senderId: senderId ?? "cli-user",
      messageId: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      timestamp: Date.now(),
    };
    for (const handler of this.messageHandlers) handler(msg);
  }

  async sendMessage(target: ChannelTarget, text: string, _opts?: SendOptions): Promise<SentMessage> {
    const messageId = `cli-resp-${Date.now()}`;
    // Notify response handlers (gateway streams this back to the WS client)
    for (const handler of this.responseHandlers) handler(target.chatId, text);
    return { messageId, chatId: target.chatId, channelId: "cli" };
  }

  async sendReaction(_target: ChannelTarget, _messageId: string, _emoji: string): Promise<void> {
    // CLI doesn't support reactions — no-op
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      const idx = this.messageHandlers.indexOf(handler);
      if (idx >= 0) this.messageHandlers.splice(idx, 1);
    };
  }

  /**
   * Register a handler for outbound responses. The gateway uses this to
   * stream responses back to the WebSocket client.
   */
  onResponse(handler: ResponseHandler): () => void {
    this.responseHandlers.push(handler);
    return () => {
      const idx = this.responseHandlers.indexOf(handler);
      if (idx >= 0) this.responseHandlers.splice(idx, 1);
    };
  }
}
