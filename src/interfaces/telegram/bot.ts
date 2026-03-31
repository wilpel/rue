import { Telegraf } from "telegraf";
import { DaemonClient } from "../cli/client.js";
import { TelegramStore } from "./store.js";
import type { EventBus } from "../../bus/bus.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

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
      dropPendingUpdates: true,
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

    // Main message handler — text only (skip if it's a sticker/photo/etc)
    this.bot.on("text", async (ctx) => {
      // Guard: if this message also has media, let the specific handler deal with it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = ctx.message as any;
      if (msg.sticker || msg.photo || msg.document || msg.voice || msg.video) return;
      const text = ctx.message.text;
      if (!text || text.startsWith("/")) return;
      await this.handleIncoming(ctx, text);
    });

    // Photo handler
    this.bot.on("photo", async (ctx) => {
      const photo = ctx.message.photo;
      const largest = photo[photo.length - 1]; // highest resolution
      const caption = ctx.message.caption ?? "";
      const filePath = await this.downloadFile(ctx, largest.file_id, "photo.jpg");
      if (!filePath) { ctx.reply("Couldn't download the image."); return; }
      const prompt = `${caption ? caption + "\n\n" : ""}[User sent an image, saved at: ${filePath}]\nUse the Read tool to view this image file.`;
      await this.handleIncoming(ctx, prompt);
    });

    // Document handler
    this.bot.on("document", async (ctx) => {
      const doc = ctx.message.document;
      if (!doc) return;
      const caption = ctx.message.caption ?? "";
      const fileName = doc.file_name ?? "document";
      const filePath = await this.downloadFile(ctx, doc.file_id, fileName);
      if (!filePath) { ctx.reply("Couldn't download the file."); return; }
      const prompt = `${caption ? caption + "\n\n" : ""}[User sent a file "${fileName}", saved at: ${filePath}]\nUse the Read tool to view this file.`;
      await this.handleIncoming(ctx, prompt);
    });

    // Voice message handler
    this.bot.on("voice", async (ctx) => {
      const voice = ctx.message.voice;
      const filePath = await this.downloadFile(ctx, voice.file_id, "voice.ogg");
      if (!filePath) { ctx.reply("Couldn't download the voice message."); return; }
      const prompt = `[User sent a voice message, saved at: ${filePath}]\nNote: This is an audio file. Acknowledge that you received a voice message but explain you can't listen to audio yet.`;
      await this.handleIncoming(ctx, prompt);
    });

    // Video handler
    this.bot.on("video", async (ctx) => {
      const video = ctx.message.video;
      const caption = ctx.message.caption ?? "";
      const filePath = await this.downloadFile(ctx, video.file_id, "video.mp4");
      if (!filePath) { ctx.reply("Couldn't download the video."); return; }
      const prompt = `${caption ? caption + "\n\n" : ""}[User sent a video, saved at: ${filePath}]\nNote: Acknowledge that you received a video but explain you can't watch videos yet.`;
      await this.handleIncoming(ctx, prompt);
    });

    // Sticker handler
    this.bot.on("sticker", async (ctx) => {
      const emoji = ctx.message.sticker.emoji ?? "sticker";
      await this.handleIncoming(ctx, `[User sent a sticker: ${emoji}]`);
    });
  }

  /**
   * Shared handler for all incoming messages (text, photos, documents, etc.)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleIncoming(ctx: any, content: string): Promise<void> {
    const telegramId = ctx.from.id;
    if (!this.store.isUserPaired(telegramId)) {
      ctx.reply("You're not paired yet. Run `rue telegram pair` in your terminal to get a code, then send /pair <code> here.");
      return;
    }

    const messageId = ctx.message.message_id;
    const chatId = ctx.message.chat.id;

    await this.enqueueMessage(telegramId, async () => {
      console.log(`[telegram] Processing message from ${telegramId}: "${content.slice(0, 50)}"`);

      await ctx.sendChatAction("typing").catch(() => {});

      const prompt = `[Telegram message from chat_id=${chatId} message_id=${messageId}]\n${content}`;

      try {
        const sendReply = async (msg: string) => {
          const cleaned = msg.replace(/\[no_?response\]/gi, "").trim();
          if (!cleaned) return;
          await this.sendLongMessage(ctx, cleaned);
          console.log(`[telegram] Sent response to ${telegramId} (${cleaned.length} chars)`);
        };

        await this.askAndReply(telegramId, prompt, 180_000, sendReply);
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
  }

  /**
   * Download a Telegram file to a temp directory. Returns the local file path.
   */
  private async downloadFile(
    ctx: { telegram: { getFileLink: (fileId: string) => Promise<URL> } },
    fileId: string,
    fileName: string,
  ): Promise<string | null> {
    try {
      const url = await ctx.telegram.getFileLink(fileId);
      const tmpDir = path.join(os.tmpdir(), "rue-telegram-files");
      fs.mkdirSync(tmpDir, { recursive: true });
      const filePath = path.join(tmpDir, `${Date.now()}-${fileName}`);
      const response = await fetch(url.toString());
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      console.log(`[telegram] Downloaded file: ${filePath} (${buffer.length} bytes)`);
      return filePath;
    } catch (err) {
      console.error(`[telegram] File download failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /**
   * Ask the daemon and collect the full response, then send it all at once.
   * The user sees the "typing..." indicator while the AI works.
   */
  private async askAndReply(
    telegramId: number,
    prompt: string,
    timeoutMs: number,
    sendMessage: (text: string) => Promise<void>,
  ): Promise<void> {
    const client = await this.getOrCreateClient(telegramId);
    let fullResponse = "";

    const doAsk = async (retry: boolean): Promise<string> => {
      if (retry) this.disconnectClient(telegramId);
      const c = retry ? await this.getOrCreateClient(telegramId) : client;
      let collected = "";
      const result = await c.ask(prompt, { onStream: (chunk) => { collected += chunk; } });
      return result.output || collected;
    };

    const askPromise = doAsk(false).catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[telegram] First attempt failed (${msg}), retrying...`);
      return doAsk(true);
    });

    let timeoutHandle: ReturnType<typeof setTimeout>;
    fullResponse = await Promise.race([
      askPromise,
      new Promise<string>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timeoutHandle));

    const cleaned = fullResponse.replace(/\[no_?response\]/gi, "").trim();
    if (cleaned) {
      console.log(`[telegram] Sending response to ${telegramId} (${cleaned.length} chars): "${cleaned.slice(0, 60)}"`);
      await sendMessage(cleaned);
      console.log(`[telegram] Sent response to ${telegramId}`);
    } else {
      console.log(`[telegram] No response to send (empty or no_response)`);
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
