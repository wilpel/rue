import { Telegraf } from "telegraf";
import { DaemonClient } from "../cli/client.js";
import { TelegramStore } from "./store.js";
import type { EventBus } from "../../bus/bus.js";

export interface TelegramBotConfig {
  botToken: string;
  daemonUrl: string;
  dataDir: string;
  bus?: EventBus;
}

export class TelegramBot {
  private bot: Telegraf;
  private store: TelegramStore;
  private daemonUrl: string;
  private activeClients = new Map<number, DaemonClient>();
  private messageQueues = new Map<number, Array<() => Promise<void>>>();
  private processingUsers = new Set<number>();

  constructor(config: TelegramBotConfig) {
    this.bot = new Telegraf(config.botToken);
    this.store = new TelegramStore(config.dataDir);
    this.daemonUrl = config.daemonUrl;
    this.setupHandlers();
  }

  getStore(): TelegramStore { return this.store; }

  async start(): Promise<void> {
    await this.bot.launch();
    console.log("[telegram] Bot started");
  }

  async stop(): Promise<void> {
    this.bot.stop("shutdown");
    for (const client of this.activeClients.values()) client.disconnect();
    this.activeClients.clear();
    console.log("[telegram] Bot stopped");
  }

  private setupHandlers(): void {
    this.bot.start((ctx) => {
      ctx.reply("Hey! I'm Rue.\n\nTo use me, you need a pairing code. Run `rue telegram pair` in your terminal, then send me:\n\n/pair <code>");
    });

    this.bot.command("pair", (ctx) => {
      const code = ctx.message.text.split(/\s+/)[1];
      if (!code) { ctx.reply("Usage: /pair <code>\n\nGet a code by running `rue telegram pair` in your terminal."); return; }
      const telegramId = ctx.from.id;
      if (this.store.isUserPaired(telegramId)) { ctx.reply("You're already paired! Just send me a message."); return; }
      if (!this.store.validatePairingCode(code)) { ctx.reply("Invalid or expired code. Run `rue telegram pair` to get a new one."); return; }
      this.store.addPairedUser(telegramId, ctx.from.username);
      ctx.reply("Paired successfully! You can now send me messages and I'll respond as Rue.");
    });

    this.bot.command("unpair", (ctx) => {
      const telegramId = ctx.from.id;
      if (this.store.removePairedUser(telegramId)) { this.disconnectClient(telegramId); ctx.reply("Unpaired."); }
      else ctx.reply("You're not paired.");
    });

    this.bot.command("status", async (ctx) => {
      const telegramId = ctx.from.id;
      if (!this.store.isUserPaired(telegramId)) { ctx.reply("Not paired."); return; }
      try {
        const client = await this.getOrCreateClient(telegramId);
        const status = await client.status();
        const agents = status.agents as Array<{ id: string; task: string; state: string }>;
        let msg = "Connected to Rue.\n";
        msg += agents.length === 0 ? "No active agents." : `${agents.length} agent(s):\n` + agents.map(a => `• ${a.task} (${a.state})`).join("\n");
        ctx.reply(msg);
      } catch { ctx.reply("Can't reach daemon. Is it running?"); }
    });

    // Main message handler
    this.bot.on("text", async (ctx) => {
      const telegramId = ctx.from.id;
      if (!this.store.isUserPaired(telegramId)) {
        ctx.reply("You're not paired yet. Run `rue telegram pair` in your terminal to get a code, then send /pair <code> here.");
        return;
      }

      const text = ctx.message.text;
      if (!text || text.startsWith("/")) return;

      const messageId = ctx.message.message_id;
      const chatId = ctx.message.chat.id;

      await this.enqueueMessage(telegramId, async () => {
        console.log(`[telegram] Processing message from ${telegramId}: "${text.slice(0, 50)}"`);

        // Show typing immediately
        await ctx.sendChatAction("typing").catch(() => {});

        const prompt = `[Telegram message from chat_id=${chatId} message_id=${messageId}]\n${text}`;

        try {
          const response = await this.askWithTimeout(telegramId, prompt, 180_000); // 3 min max

          if (!response || response === "[no_response]" || response.toLowerCase() === "[no response]") return;
          const cleaned = response.replace(/\[no_?response\]/gi, "").trim();
          if (!cleaned) return;

          // Split and send
          const paragraphs = cleaned.split(/\n\n+/).filter(p => p.trim());
          if (paragraphs.length <= 2) {
            await this.sendLongMessage(ctx, cleaned);
          } else {
            const chunks: string[] = [];
            let current = "";
            for (const para of paragraphs) {
              if (current && (current.length + para.length + 2) > 2000) { chunks.push(current.trim()); current = para; }
              else current = current ? current + "\n\n" + para : para;
            }
            if (current.trim()) chunks.push(current.trim());
            for (const chunk of chunks) await this.sendLongMessage(ctx, chunk);
          }

          console.log(`[telegram] Sent response to ${telegramId} (${cleaned.length} chars)`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[telegram] Failed for ${telegramId}: ${msg}`);
          if (msg.includes("timed out")) {
            await ctx.reply("I'm taking too long on this. Let me try again — send your message once more.").catch(() => {});
          } else {
            await ctx.reply("Something went wrong. Try again.").catch(() => {});
          }
          // Always clean up the client on failure
          this.disconnectClient(telegramId);
        }
      });
    });
  }

  /**
   * Ask the daemon with a hard timeout. If the SDK hangs, this still resolves
   * so the message queue doesn't block forever.
   */
  private async askWithTimeout(telegramId: number, prompt: string, timeoutMs: number): Promise<string> {
    // Start typing indicator
    const typingInterval = setInterval(() => {
      // We don't have ctx here, but that's ok — typing was already sent
    }, 4000);

    try {
      return await Promise.race([
        this.doAsk(telegramId, prompt),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
        ),
      ]);
    } finally {
      clearInterval(typingInterval);
    }
  }

  /**
   * Actually perform the ask, with one retry on connection failure.
   */
  private async doAsk(telegramId: number, prompt: string): Promise<string> {
    const attempt = async (retry: boolean): Promise<string> => {
      if (retry) this.disconnectClient(telegramId);

      const client = await this.getOrCreateClient(telegramId);
      let fullResponse = "";

      const result = await client.ask(prompt, {
        onStream: (chunk) => { fullResponse += chunk; },
      });

      return result.output || fullResponse;
    };

    try {
      return await attempt(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[telegram] First attempt failed (${msg}), retrying with fresh connection...`);
      return await attempt(true);
    }
  }

  private async getOrCreateClient(telegramId: number): Promise<DaemonClient> {
    const existing = this.activeClients.get(telegramId);
    if (existing && existing.connected) return existing;
    if (existing) { existing.disconnect(); this.activeClients.delete(telegramId); }

    const client = new DaemonClient(this.daemonUrl);
    await client.connect();
    this.activeClients.set(telegramId, client);
    return client;
  }

  private disconnectClient(telegramId: number): void {
    const client = this.activeClients.get(telegramId);
    if (client) { client.disconnect(); this.activeClients.delete(telegramId); }
  }

  private async enqueueMessage(userId: number, handler: () => Promise<void>): Promise<void> {
    if (!this.messageQueues.has(userId)) this.messageQueues.set(userId, []);
    this.messageQueues.get(userId)!.push(handler);

    if (this.processingUsers.has(userId)) return;
    this.processingUsers.add(userId);

    while (this.messageQueues.get(userId)?.length) {
      const next = this.messageQueues.get(userId)!.shift()!;
      try {
        await next();
      } catch (err) {
        console.error(`[telegram] Queue error for ${userId}:`, err instanceof Error ? err.message : err);
      }
    }

    this.processingUsers.delete(userId);
    this.messageQueues.delete(userId);
  }

  private async sendLongMessage(
    ctx: { reply: (text: string, extra?: Record<string, unknown>) => Promise<unknown> },
    text: string,
  ): Promise<void> {
    const MAX_LEN = 4096;
    if (text.length <= MAX_LEN) { await ctx.reply(text); return; }

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
    for (const chunk of chunks) {
      if (chunk.trim()) await ctx.reply(chunk);
    }
  }
}
