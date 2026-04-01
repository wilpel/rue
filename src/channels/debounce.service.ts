import { Injectable } from "@nestjs/common";
import type { InboundMessage, MediaAttachment } from "./channel-adapter.js";

export interface DebounceConfig {
  textGapMs: number;
  mediaGapMs: number;
  maxFragments: number;
  maxChars: number;
}

export interface DebouncedBatch {
  chatId: string;
  channelId: string;
  messages: InboundMessage[];
  combinedText: string;
  media: MediaAttachment[];
}

type BatchHandler = (batch: DebouncedBatch) => void;

interface PendingBatch {
  messages: InboundMessage[];
  timer: ReturnType<typeof setTimeout>;
  totalChars: number;
}

@Injectable()
export class DebounceService {
  private pending = new Map<string, PendingBatch>();
  private handlers: BatchHandler[] = [];
  private readonly config: DebounceConfig;

  constructor(config?: Partial<DebounceConfig>) {
    this.config = {
      textGapMs: config?.textGapMs ?? 2000,
      mediaGapMs: config?.mediaGapMs ?? 100,
      maxFragments: config?.maxFragments ?? 12,
      maxChars: config?.maxChars ?? 10000,
    };
  }

  onBatch(handler: BatchHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  push(msg: InboundMessage): void {
    const key = msg.chatId;
    let batch = this.pending.get(key);
    if (batch) {
      clearTimeout(batch.timer);
      batch.messages.push(msg);
      batch.totalChars += msg.text.length;
    } else {
      batch = { messages: [msg], timer: null as unknown as ReturnType<typeof setTimeout>, totalChars: msg.text.length };
      this.pending.set(key, batch);
    }
    if (batch.messages.length >= this.config.maxFragments || batch.totalChars >= this.config.maxChars) {
      this.flush(key, batch);
      return;
    }
    const hasMedia = msg.media && msg.media.length > 0 && !msg.text;
    const gapMs = hasMedia ? this.config.mediaGapMs : this.config.textGapMs;
    batch.timer = setTimeout(() => this.flush(key, batch!), gapMs);
  }

  private flush(key: string, batch: PendingBatch): void {
    this.pending.delete(key);
    clearTimeout(batch.timer);
    const messages = batch.messages;
    const first = messages[0];
    const combinedText = messages.map(m => m.text).filter(Boolean).join("\n");
    const media = messages.flatMap(m => m.media ?? []);
    const debounced: DebouncedBatch = { chatId: first.chatId, channelId: first.channelId, messages, combinedText, media };
    for (const handler of this.handlers) handler(debounced);
  }
}
