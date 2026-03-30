import { Injectable } from "@nestjs/common";
import { MessageRepository } from "../memory/message.repository.js";
import { BusService } from "../bus/bus.service.js";

export interface InboxMessage {
  id: string;
  source: string;
  content: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

type MessageHandler = (message: InboxMessage) => void;

@Injectable()
export class InboxService {
  private handlers = new Set<MessageHandler>();

  constructor(
    private readonly messages: MessageRepository,
    private readonly bus: BusService,
  ) {}

  push(source: string, content: string, metadata: Record<string, unknown>): InboxMessage {
    const stored = this.messages.append({
      role: source === "delegate" || source === "scheduler" ? "push" : "user",
      content,
      metadata: { ...metadata, source },
    });

    const inboxMsg: InboxMessage = {
      id: stored.id,
      source,
      content,
      metadata: { ...metadata, source },
      timestamp: stored.createdAt,
    };

    this.bus.emit("message:created", {
      id: stored.id,
      role: stored.role,
      content,
      timestamp: stored.createdAt,
      metadata: { ...metadata, source },
    });

    for (const handler of this.handlers) {
      handler(inboxMsg);
    }

    return inboxMsg;
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  formatPrefix(source: string): string {
    switch (source) {
      case "telegram": return "[User via Telegram]";
      case "websocket": return "[User via CLI]";
      case "delegate": return "[Sub-Agent]";
      case "scheduler": return "[Scheduled Job]";
      default: return `[${source}]`;
    }
  }
}
