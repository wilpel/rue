import { Injectable } from "@nestjs/common";
import type { ChannelAdapter, ChannelTarget, SendOptions, SentMessage, InboundMessage } from "./channel-adapter.js";
import { log } from "../shared/logger.js";

type MessageHandler = (msg: InboundMessage) => void;

@Injectable()
export class ChannelRegistry {
  private adapters = new Map<string, ChannelAdapter>();
  private handlers: MessageHandler[] = [];
  private unsubscribers: Array<() => void> = [];

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.id, adapter);
    const unsub = adapter.onMessage((msg) => {
      for (const handler of this.handlers) handler(msg);
    });
    this.unsubscribers.push(unsub);
    log.info(`[channels] Registered adapter: ${adapter.id}`);
  }

  get(id: string): ChannelAdapter | undefined {
    return this.adapters.get(id);
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => { const idx = this.handlers.indexOf(handler); if (idx >= 0) this.handlers.splice(idx, 1); };
  }

  async sendMessage(channelId: string, target: ChannelTarget, text: string, opts?: SendOptions): Promise<SentMessage> {
    const adapter = this.adapters.get(channelId);
    if (!adapter) throw new Error(`No adapter registered for channel: ${channelId}`);
    return adapter.sendMessage(target, text, opts);
  }

  async sendReaction(channelId: string, target: ChannelTarget, messageId: string, emoji: string): Promise<void> {
    const adapter = this.adapters.get(channelId);
    if (!adapter) throw new Error(`No adapter registered for channel: ${channelId}`);
    return adapter.sendReaction(target, messageId, emoji);
  }

  async startAll(): Promise<void> {
    for (const adapter of this.adapters.values()) await adapter.start();
  }

  async stopAll(): Promise<void> {
    for (const adapter of this.adapters.values()) await adapter.stop();
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }
}
