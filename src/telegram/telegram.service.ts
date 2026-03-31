import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Telegraf } from "telegraf";
import { InboxService } from "../inbox/inbox.service.js";
import { TelegramStoreService } from "./telegram-store.service.js";
import { log } from "../shared/logger.js";

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf | null = null;
  private store: TelegramStoreService;

  constructor(
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(TelegramStoreService) store: TelegramStoreService,
  ) {
    this.store = store;
  }

  async onModuleInit(): Promise<void> {
    const token = this.store.getBotToken();
    if (!token) { log.info("[telegram] No bot token — skipping"); return; }

    try {
      this.bot = new Telegraf(token, { handlerTimeout: 300_000 });
      this.bot.catch((err: unknown) => {
        log.error(`[telegram] Bot error (recovered): ${err instanceof Error ? err.message : String(err)}`);
      });
      this.setupHandlers();
      await this.bot.launch();
      log.info("[telegram] Bot started");
    } catch (err) {
      log.error(`[telegram] Failed to start: ${err instanceof Error ? err.message : String(err)}`);
      this.bot = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot) { this.bot.stop("shutdown"); log.info("[telegram] Bot stopped"); }
  }

  async sendMessage(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
    const token = this.store.getBotToken();
    if (!token) { log.error("[telegram] No token — cannot send"); return; }

    const MAX_LEN = 4096;
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_LEN) { chunks.push(remaining); break; }
      let splitIdx = remaining.lastIndexOf("\n\n", MAX_LEN);
      if (splitIdx < MAX_LEN / 2) splitIdx = remaining.lastIndexOf("\n", MAX_LEN);
      if (splitIdx < MAX_LEN / 4) splitIdx = MAX_LEN;
      chunks.push(remaining.slice(0, splitIdx));
      remaining = remaining.slice(splitIdx).trim();
    }

    for (let i = 0; i < chunks.length; i++) {
      const body: Record<string, unknown> = { chat_id: chatId, text: chunks[i] };
      if (i === 0 && replyToMessageId) body.reply_to_message_id = replyToMessageId;
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } catch (err) {
        log.error(`[telegram] Send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private setupHandlers(): void {
    if (!this.bot) return;

    this.bot.start((ctx) => {
      ctx.reply("Hey! I'm Rue.\n\nTo use me, you need a pairing code. Run `rue telegram pair` in your terminal, then send me:\n\n/pair <code>");
    });

    this.bot.command("pair", (ctx) => {
      const code = ctx.message.text.split(/\s+/)[1];
      if (!code) { ctx.reply("Usage: /pair <code>"); return; }
      if (this.store.isUserPaired(ctx.from.id)) { ctx.reply("Already paired!"); return; }
      if (!this.store.validatePairingCode(code)) { ctx.reply("Invalid or expired code."); return; }
      this.store.addPairedUser(ctx.from.id, ctx.from.username);
      ctx.reply("Paired! Send me messages and I'll respond as Rue.");
    });

    this.bot.command("unpair", (ctx) => {
      if (this.store.removePairedUser(ctx.from.id)) ctx.reply("Unpaired.");
      else ctx.reply("You're not paired.");
    });

    this.bot.on("text", async (ctx) => {
      const telegramId = ctx.from.id;
      if (!this.store.isUserPaired(telegramId)) {
        ctx.reply("Not paired. Run `rue telegram pair` first, then /pair <code>.");
        return;
      }

      const text = ctx.message.text;
      if (!text || text.startsWith("/")) return;

      const chatId = ctx.message.chat.id;
      const messageId = ctx.message.message_id;

      log.info(`[telegram] Message from ${telegramId}: "${text.slice(0, 50)}"`);
      await ctx.sendChatAction("typing").catch(() => {});

      // Push to unified inbox — the main agent will handle it
      this.inbox.push("telegram", text, { chatId, messageId, telegramId });
    });
  }
}
