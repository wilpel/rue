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
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private lastUpdateAt = Date.now();
  private stopped = false;

  constructor(config: TelegramBotConfig) {
    this.bot = new Telegraf(config.botToken, {
      // Default is 90s which is too short for SDK queries.
      // Our own askWithTimeout (180s) handles the real timeout.
      handlerTimeout: 300_000,
    });
    this.store = new TelegramStore(config.dataDir);
    this.daemonUrl = config.daemonUrl;
    this.setupHandlers();

    // Prevent unhandled errors from crashing the bot
    this.bot.catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram] Bot error (recovered): ${msg}`);
    });
  }

  getStore(): TelegramStore { return this.store; }

  async start(): Promise<void> {
    this.stopped = false;
    await this.launchBot();
    this.startHealthMonitor();
    console.log("[telegram] Bot started");
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.healthTimer) { clearInterval(this.healthTimer); this.healthTimer = null; }
    this.bot.stop("shutdown");
    for (const client of this.activeClients.values()) client.disconnect();
    this.activeClients.clear();
    console.log("[telegram] Bot stopped");
  }

  private async launchBot(): Promise<void> {
    await this.bot.launch({
      dropPendingUpdates: false,
      allowedUpdates: ["message"],
    });
    this.lastUpdateAt = Date.now();
  }

  /**
   * Monitor Telegraf polling health. If no updates received for 5 minutes,
   * assume the long-poll connection died and restart the bot.
   */
  private startHealthMonitor(): void {
    const STALE_THRESHOLD_MS = 300_000; // 5 minutes with no updates = probably dead
    const CHECK_INTERVAL_MS = 60_000;   // check every minute

    this.healthTimer = setInterval(async () => {
      if (this.stopped) return;
      const elapsed = Date.now() - this.lastUpdateAt;
      if (elapsed > STALE_THRESHOLD_MS) {
        console.log(`[telegram] No updates for ${Math.round(elapsed / 1000)}s — restarting polling`);
        try {
          this.bot.stop("reconnect");
          await this.launchBot();
          console.log("[telegram] Polling restarted successfully");
        } catch (err) {
          console.error(`[telegram] Restart failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    }, CHECK_INTERVAL_MS);
  }

  private setupHandlers(): void {
    // Track every update to detect stale polling
    this.bot.use((_ctx, next) => {
      this.lastUpdateAt = Date.now();
      return next();
    });

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
          const sendReply = async (msg: string) => {
            const cleaned = msg.replace(/\[no_?response\]/gi, "").trim();
            if (!cleaned) return;
            await this.sendLongMessage(ctx, cleaned);
            console.log(`[telegram] Sent response to ${telegramId} (${cleaned.length} chars)`);
          };

          await this.askStreaming(telegramId, prompt, 180_000, sendReply);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[telegram] Failed for ${telegramId}: ${msg}`);
          if (msg.includes("timed out")) {
            await ctx.reply("I'm taking too long on this. Let me try again — send your message once more.").catch(() => {});
          } else {
            await ctx.reply("Something went wrong. Try again.").catch(() => {});
          }
          this.disconnectClient(telegramId);
        }
      });
    });
  }

  /**
   * Stream-aware ask: sends the AI's first text burst immediately, then
   * sends subsequent text bursts as separate messages. This way the user
   * sees "On it." right away while the AI does tool work in the background.
   *
   * A "burst" is detected by a pause in streaming (no new chunks for 1.5s).
   */
  private async askStreaming(
    telegramId: number,
    prompt: string,
    timeoutMs: number,
    sendMessage: (text: string) => Promise<void>,
  ): Promise<void> {
    const client = await this.getOrCreateClient(telegramId);

    let buffer = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let sentFirst = false;
    // After the first message is sent, use a longer delay for follow-ups
    // since tool execution gaps can be long.
    const FIRST_FLUSH_MS = 8000;  // wait 8s to collect the full initial response (ack + context)
    const LATER_FLUSH_MS = 8000;  // 8s pause = likely a new text section after tool work

    const flush = async () => {
      const text = buffer.replace(/\[no_?response\]/gi, "").trim();
      buffer = "";
      if (text) {
        console.log(`[telegram] Flushing${sentFirst ? " follow-up" : " first"} to ${telegramId}: "${text.slice(0, 80)}"`);
        sentFirst = true;
        await sendMessage(text);
      }
    };

    const onChunk = (chunk: string) => {
      buffer += chunk;
      // Reset the flush timer on each chunk — flush only after a pause
      if (flushTimer) clearTimeout(flushTimer);
      const delay = sentFirst ? LATER_FLUSH_MS : FIRST_FLUSH_MS;
      flushTimer = setTimeout(() => { flush().catch(() => {}); }, delay);
    };

    const doAsk = async (retry: boolean): Promise<void> => {
      if (retry) this.disconnectClient(telegramId);
      const c = retry ? await this.getOrCreateClient(telegramId) : client;

      await c.ask(prompt, { onStream: onChunk });
    };

    const askPromise = doAsk(false).catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[telegram] First attempt failed (${msg}), retrying with fresh connection...`);
      return doAsk(true);
    });

    // Race against hard timeout (clean up the timer to avoid leaks)
    let timeoutHandle: ReturnType<typeof setTimeout>;
    await Promise.race([
      askPromise,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timeoutHandle));

    // Flush any remaining buffered text
    if (flushTimer) clearTimeout(flushTimer);
    if (buffer.trim()) await flush();
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

    try {
      while (this.messageQueues.get(userId)?.length) {
        const next = this.messageQueues.get(userId)!.shift()!;
        try {
          await next();
        } catch (err) {
          console.error(`[telegram] Queue error for ${userId}:`, err instanceof Error ? err.message : err);
        }
      }
    } finally {
      this.processingUsers.delete(userId);
      this.messageQueues.delete(userId);
    }
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
