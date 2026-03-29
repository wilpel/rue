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

  constructor(config: TelegramBotConfig) {
    this.bot = new Telegraf(config.botToken);
    this.store = new TelegramStore(config.dataDir);
    this.daemonUrl = config.daemonUrl;
    this.setupHandlers();
  }

  getStore(): TelegramStore {
    return this.store;
  }

  async start(): Promise<void> {
    await this.bot.launch();
    console.log("[telegram] Bot started");
  }

  async stop(): Promise<void> {
    this.bot.stop("shutdown");
    for (const client of this.activeClients.values()) {
      client.disconnect();
    }
    this.activeClients.clear();
    console.log("[telegram] Bot stopped");
  }

  private setupHandlers(): void {
    // /start — welcome message
    this.bot.start((ctx) => {
      ctx.reply(
        "Hey! I'm Rue.\n\n" +
          "To use me, you need a pairing code. Run `rue telegram pair` in your terminal, " +
          "then send me:\n\n/pair <code>",
      );
    });

    // /pair <code> — pair a Telegram account
    this.bot.command("pair", (ctx) => {
      const code = ctx.message.text.split(/\s+/)[1];
      if (!code) {
        ctx.reply("Usage: /pair <code>\n\nGet a code by running `rue telegram pair` in your terminal.");
        return;
      }

      const telegramId = ctx.from.id;
      const username = ctx.from.username;

      if (this.store.isUserPaired(telegramId)) {
        ctx.reply("You're already paired! Just send me a message.");
        return;
      }

      if (!this.store.validatePairingCode(code)) {
        ctx.reply("Invalid or expired code. Run `rue telegram pair` to get a new one.");
        return;
      }

      this.store.addPairedUser(telegramId, username);
      ctx.reply("Paired successfully! You can now send me messages and I'll respond as Rue.");
    });

    // /unpair — remove pairing
    this.bot.command("unpair", (ctx) => {
      const telegramId = ctx.from.id;
      if (this.store.removePairedUser(telegramId)) {
        this.disconnectClient(telegramId);
        ctx.reply("Unpaired. You'll need a new pairing code to use me again.");
      } else {
        ctx.reply("You're not paired.");
      }
    });

    // /status — check pairing status
    this.bot.command("status", async (ctx) => {
      const telegramId = ctx.from.id;
      if (!this.store.isUserPaired(telegramId)) {
        ctx.reply("Not paired. Use /pair <code> to connect.");
        return;
      }

      try {
        const client = await this.getOrCreateClient(telegramId);
        const status = await client.status();
        const agents = status.agents as Array<{ id: string; task: string; state: string }>;

        let msg = "Connected to Rue daemon.\n";
        if (agents.length === 0) {
          msg += "No active agents.";
        } else {
          msg += `${agents.length} active agent(s):\n`;
          for (const a of agents) {
            msg += `• ${a.task} (${a.state})\n`;
          }
        }
        ctx.reply(msg);
      } catch {
        ctx.reply("Couldn't connect to Rue daemon. Is it running?");
      }
    });

    // Regular messages — forward to Rue
    this.bot.on("text", async (ctx) => {
      const telegramId = ctx.from.id;

      if (!this.store.isUserPaired(telegramId)) {
        ctx.reply(
          "You're not paired yet. Run `rue telegram pair` in your terminal to get a code, " +
            "then send /pair <code> here.",
        );
        return;
      }

      const text = ctx.message.text;
      if (!text || text.startsWith("/")) return;

      const messageId = ctx.message.message_id;
      const chatId = ctx.message.chat.id;

      // Show typing indicator
      await ctx.sendChatAction("typing");

      // Include Telegram context so Rue can react to messages
      const prompt = `[Telegram message from chat_id=${chatId} message_id=${messageId}]\n${text}`;

      const askWithWatchdog = async (retry = false): Promise<void> => {
        if (retry) this.disconnectClient(telegramId);
        const client = await this.getOrCreateClient(telegramId);

        let buffer = "";
        let sentAnything = false;
        let flushTimer: NodeJS.Timeout | null = null;
        const typingInterval = setInterval(() => {
          ctx.sendChatAction("typing").catch(() => {});
        }, 4000);

        const flush = async () => {
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          const toSend = buffer.trim();
          if (toSend) {
            buffer = "";
            sentAnything = true;
            await this.sendLongMessage(ctx, toSend).catch(() => {});
          }
        };

        try {
          const result = await client.ask(prompt, {
            onStream: (chunk) => {
              buffer += chunk;
              if (buffer.includes("\n\n")) {
                flush();
              } else if (!flushTimer) {
                flushTimer = setTimeout(() => flush(), 1500);
              }
            },
          });

          if (result.output && !sentAnything) {
            buffer = result.output;
          }
          await flush();

          if (!sentAnything) {
            await ctx.reply("(no response)");
          }
        } finally {
          if (flushTimer) clearTimeout(flushTimer);
          clearInterval(typingInterval);
        }
      };

      try {
        try {
          await askWithWatchdog(false);
        } catch (firstErr) {
          const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
          console.log(`[telegram] First attempt failed for user ${telegramId}: ${msg}. Retrying...`);
          try {
            await askWithWatchdog(true);
          } catch {
            // Both attempts failed — send error and clean up
            throw firstErr;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[telegram] Error for user ${telegramId}: ${msg}`);
        await ctx.reply("Something went wrong. Try again in a moment.").catch(() => {});
        this.disconnectClient(telegramId);
      }
    });
  }

  private async getOrCreateClient(telegramId: number): Promise<DaemonClient> {
    const existing = this.activeClients.get(telegramId);
    if (existing && existing.connected) return existing;

    // Clean up dead client
    if (existing) {
      existing.disconnect();
      this.activeClients.delete(telegramId);
    }

    const client = new DaemonClient(this.daemonUrl);
    await client.connect();
    this.activeClients.set(telegramId, client);
    return client;
  }

  private disconnectClient(telegramId: number): void {
    const client = this.activeClients.get(telegramId);
    if (client) {
      client.disconnect();
      this.activeClients.delete(telegramId);
    }
  }

  private async sendLongMessage(
    ctx: { reply: (text: string, extra?: Record<string, unknown>) => Promise<unknown> },
    text: string,
  ): Promise<void> {
    const MAX_LEN = 4096;
    if (text.length <= MAX_LEN) {
      await ctx.reply(text);
      return;
    }

    // Split on paragraph boundaries when possible
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_LEN) {
        chunks.push(remaining);
        break;
      }
      // Find a good split point
      let splitAt = remaining.lastIndexOf("\n\n", MAX_LEN);
      if (splitAt === -1 || splitAt < MAX_LEN / 2) {
        splitAt = remaining.lastIndexOf("\n", MAX_LEN);
      }
      if (splitAt === -1 || splitAt < MAX_LEN / 2) {
        splitAt = MAX_LEN;
      }
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  }
}
