export type ChannelCapability = "reactions" | "threading" | "media" | "editing" | "polls";

export interface ChannelTarget {
  chatId: string;
  replyToMessageId?: string;
}

export interface SendOptions {
  replyToMessageId?: string;
  parseMode?: "text" | "html" | "markdown";
}

export interface SentMessage {
  messageId: string;
  chatId: string;
  channelId: string;
}

export interface MediaAttachment {
  type: "photo" | "video" | "audio" | "document" | "voice" | "sticker";
  url?: string;
  fileId?: string;
  mimeType?: string;
  caption?: string;
}

export interface InboundMessage {
  channelId: string;
  chatId: string;
  senderId: string;
  messageId: string;
  text: string;
  media?: MediaAttachment[];
  replyTo?: string;
  timestamp: number;
}

export interface ChannelAdapter {
  readonly id: string;
  readonly capabilities: Set<ChannelCapability>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(target: ChannelTarget, text: string, opts?: SendOptions): Promise<SentMessage>;
  sendReaction(target: ChannelTarget, messageId: string, emoji: string): Promise<void>;
  onMessage(handler: (msg: InboundMessage) => void): () => void;
}
