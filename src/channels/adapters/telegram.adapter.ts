import { Telegraf } from "telegraf";
import type {
  ChannelAdapter,
  ChannelCapability,
  ChannelTarget,
  SendOptions,
  SentMessage,
  InboundMessage,
} from "../channel-adapter.js";
import type { TelegramStoreService } from "./telegram-store.service.js";
import { log } from "../../shared/logger.js";

type MessageHandler = (msg: InboundMessage) => void;

export class TelegramAdapter implements ChannelAdapter {
  readonly id = "telegram";
  readonly capabilities: Set<ChannelCapability> = new Set(["reactions", "media"]);

  private bot: Telegraf | null = null;
  private handlers: MessageHandler[] = [];

  constructor(private readonly store: TelegramStoreService) {}

  private emit(msg: InboundMessage): void {
    for (const handler of this.handlers) handler(msg);
  }

  async start(): Promise<void> {
    const token = await this.store.getBotToken();
    if (!token) {
      log.info("[telegram] No bot token — skipping");
      return;
    }

    this.bot = new Telegraf(token, { handlerTimeout: 300_000 });
    this.bot.catch((err: unknown) => {
      log.error(`[telegram] Bot error (recovered): ${err instanceof Error ? err.message : String(err)}`);
    });
    this.setupHandlers();

    this.bot
      .launch({ dropPendingUpdates: true, allowedUpdates: ["message"] })
      .catch((err) => log.error(`[telegram] Launch failed: ${err instanceof Error ? err.message : String(err)}`));
    log.info("[telegram] Bot starting");
  }

  async stop(): Promise<void> {
    if (this.bot) {
      this.bot.stop("shutdown");
      log.info("[telegram] Bot stopped");
    }
  }

  async sendMessage(target: ChannelTarget, text: string, opts?: SendOptions): Promise<SentMessage> {
    const token = await this.store.getBotToken();
    if (!token) throw new Error("[telegram] No token — cannot send");

    const chatId = target.chatId;
    const replyToMessageId = opts?.replyToMessageId ? Number(opts.replyToMessageId) : undefined;

    const MAX_LEN = 4096;
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_LEN) {
        chunks.push(remaining);
        break;
      }
      let splitIdx = remaining.lastIndexOf("\n\n", MAX_LEN);
      if (splitIdx < MAX_LEN / 2) splitIdx = remaining.lastIndexOf("\n", MAX_LEN);
      if (splitIdx < MAX_LEN / 4) splitIdx = MAX_LEN;
      chunks.push(remaining.slice(0, splitIdx));
      remaining = remaining.slice(splitIdx).trim();
    }

    let lastMessageId: string | undefined;
    for (let i = 0; i < chunks.length; i++) {
      const body: Record<string, unknown> = { chat_id: chatId, text: chunks[i] };
      if (i === 0 && replyToMessageId) body.reply_to_message_id = replyToMessageId;
      try {
        const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await resp.json()) as { result?: { message_id?: number } };
        if (json.result?.message_id) lastMessageId = String(json.result.message_id);
      } catch (err) {
        log.error(`[telegram] Send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      messageId: lastMessageId ?? "unknown",
      chatId,
      channelId: this.id,
    };
  }

  async sendReaction(target: ChannelTarget, messageId: string, emoji: string): Promise<void> {
    const token = await this.store.getBotToken();
    if (!token) return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: target.chatId,
          message_id: Number(messageId),
          reaction: [{ type: "emoji", emoji }],
        }),
      });
    } catch (err) {
      log.error(`[telegram] React failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  private setupHandlers(): void {
    if (!this.bot) return;

    this.bot.start((ctx) => {
      ctx.reply(
        "Hey! I'm Rue.\n\nTo use me, you need a pairing code. Run `rue telegram pair` in your terminal, then send me:\n\n/pair <code>",
      );
    });

    this.bot.command("pair", async (ctx) => {
      const code = ctx.message.text.split(/\s+/)[1];
      if (!code) {
        ctx.reply("Usage: /pair <code>");
        return;
      }
      if (await this.store.isUserPaired(ctx.from.id)) {
        ctx.reply("Already paired!");
        return;
      }
      if (!await this.store.validatePairingCode(code)) {
        ctx.reply("Invalid or expired code.");
        return;
      }
      await this.store.addPairedUser(ctx.from.id, ctx.from.username);
      ctx.reply("Paired! Send me messages and I'll respond as Rue.");
    });

    this.bot.command("unpair", async (ctx) => {
      if (await this.store.removePairedUser(ctx.from.id)) ctx.reply("Unpaired.");
      else ctx.reply("You're not paired.");
    });

    // Handle text messages
    this.bot.on("text", async (ctx) => {
      await this.handleMessage(ctx, ctx.message.text);
    });

    // Handle photos (with optional caption)
    this.bot.on("photo", async (ctx) => {
      const caption = ctx.message.caption ?? "";
      const text = caption ? `[Photo] ${caption}` : "[Photo sent by user]";
      await this.handleMessage(ctx, text);
    });

    // Handle documents/files (with optional caption)
    this.bot.on("document", async (ctx) => {
      const fileName = ctx.message.document.file_name ?? "file";
      const caption = ctx.message.caption ?? "";
      const text = caption ? `[File: ${fileName}] ${caption}` : `[File sent: ${fileName}]`;
      await this.handleMessage(ctx, text);
    });

    // Handle voice messages
    this.bot.on("voice", async (ctx) => {
      await this.handleMessage(ctx, "[Voice message sent by user]");
    });

    // Handle stickers
    this.bot.on("sticker", async (ctx) => {
      const emoji = ctx.message.sticker.emoji ?? "sticker";
      await this.handleMessage(ctx, `[Sticker: ${emoji}]`);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleMessage(ctx: any, text: string): Promise<void> {
    const telegramId = ctx.from.id;
    if (!await this.store.isUserPaired(telegramId)) {
      ctx.reply("Not paired. Run `rue telegram pair` first, then /pair <code>.");
      return;
    }

    if (!text || text.startsWith("/")) return;

    const chatId = String(ctx.message.chat.id);
    const messageId = String(ctx.message.message_id);

    log.info(`[telegram] Message from ${telegramId}: "${text.slice(0, 50)}"`);
    await ctx.sendChatAction("typing").catch(() => {});

    this.emit({
      channelId: this.id,
      chatId,
      senderId: String(telegramId),
      messageId,
      text,
      timestamp: Date.now(),
    });
  }
}
