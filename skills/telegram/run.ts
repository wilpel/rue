#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const DATA_DIR = path.join(os.homedir(), ".rue");
const CONFIG_PATH = path.join(DATA_DIR, "telegram.json");

interface TelegramConfig {
  botToken?: string;
  pairedUsers: Array<{ telegramId: number; telegramUsername?: string; pairedAt: string }>;
}

function loadConfig(): TelegramConfig {
  if (!fs.existsSync(CONFIG_PATH)) return { pairedUsers: [] };
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

function getArg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

async function telegramApi(token: string, method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { ok: boolean; description?: string; result?: unknown };
  if (!data.ok) throw new Error(`Telegram API error: ${data.description ?? "unknown"}`);
  return data.result;
}

async function telegramApiForm(token: string, method: string, form: FormData): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: form,
  });
  const data = await res.json() as { ok: boolean; description?: string; result?: unknown };
  if (!data.ok) throw new Error(`Telegram API error: ${data.description ?? "unknown"}`);
  return data.result;
}

const args = process.argv.slice(2);
const command = args[0];

const config = loadConfig();

if (!config.botToken) {
  console.error("No Telegram bot token configured. Run: rue telegram setup <token>");
  process.exit(1);
}

const token = config.botToken;

function getTargetUsers(): number[] {
  const userId = getArg("user");
  if (userId) return [parseInt(userId, 10)];
  return config.pairedUsers.map(u => u.telegramId);
}

switch (command) {
  case "react": {
    const chatId = getArg("chat-id");
    const messageId = getArg("message-id");
    const emoji = getArg("emoji");
    if (!chatId || !messageId || !emoji) {
      console.error("Usage: run.ts react --chat-id <id> --message-id <id> --emoji <emoji>");
      process.exit(1);
    }
    try {
      await telegramApi(token, "setMessageReaction", {
        chat_id: parseInt(chatId, 10),
        message_id: parseInt(messageId, 10),
        reaction: [{ type: "emoji", emoji }],
      });
      console.log(`Reacted with ${emoji} to message ${messageId} in chat ${chatId}`);
    } catch (err) {
      console.error(`Failed to react: ${err instanceof Error ? err.message : err}`);
    }
    break;
  }

  case "send": {
    const message = getArg("message");
    if (!message) { console.error("Usage: run.ts send --message <text> [--user <id>]"); process.exit(1); }
    const users = getTargetUsers();
    if (users.length === 0) { console.error("No paired users. Run: rue telegram pair"); process.exit(1); }

    for (const chatId of users) {
      try {
        await telegramApi(token, "sendMessage", {
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
        });
        console.log(`Sent to ${chatId}`);
      } catch (err) {
        console.error(`Failed to send to ${chatId}: ${err instanceof Error ? err.message : err}`);
      }
    }
    break;
  }

  case "send-image": {
    const filePath = getArg("path");
    const url = getArg("url");
    const caption = getArg("caption") ?? "";
    const users = getTargetUsers();
    if (users.length === 0) { console.error("No paired users."); process.exit(1); }

    if (!filePath && !url) {
      console.error("Usage: run.ts send-image --path <file> [--caption <text>] [--user <id>]");
      console.error("   or: run.ts send-image --url <url> [--caption <text>] [--user <id>]");
      process.exit(1);
    }

    for (const chatId of users) {
      try {
        if (url) {
          // Send by URL
          await telegramApi(token, "sendPhoto", {
            chat_id: chatId,
            photo: url,
            caption,
          });
        } else if (filePath) {
          // Send by file upload
          const form = new FormData();
          form.append("chat_id", String(chatId));
          const fileBuffer = fs.readFileSync(filePath);
          const blob = new Blob([fileBuffer]);
          form.append("photo", blob, path.basename(filePath));
          if (caption) form.append("caption", caption);
          await telegramApiForm(token, "sendPhoto", form);
        }
        console.log(`Image sent to ${chatId}`);
      } catch (err) {
        console.error(`Failed to send image to ${chatId}: ${err instanceof Error ? err.message : err}`);
      }
    }
    break;
  }

  case "send-file": {
    const filePath = getArg("path");
    const caption = getArg("caption") ?? "";
    const users = getTargetUsers();
    if (users.length === 0) { console.error("No paired users."); process.exit(1); }

    if (!filePath) {
      console.error("Usage: run.ts send-file --path <file> [--caption <text>] [--user <id>]");
      process.exit(1);
    }

    for (const chatId of users) {
      try {
        const form = new FormData();
        form.append("chat_id", String(chatId));
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer]);
        form.append("document", blob, path.basename(filePath));
        if (caption) form.append("caption", caption);
        await telegramApiForm(token, "sendDocument", form);
        console.log(`File sent to ${chatId}`);
      } catch (err) {
        console.error(`Failed to send file to ${chatId}: ${err instanceof Error ? err.message : err}`);
      }
    }
    break;
  }

  case "users": {
    if (config.pairedUsers.length === 0) {
      console.log("No paired users.");
    } else {
      console.log(`${config.pairedUsers.length} paired user(s):\n`);
      for (const u of config.pairedUsers) {
        const name = u.telegramUsername ? `@${u.telegramUsername}` : `ID: ${u.telegramId}`;
        console.log(`  ${name} (paired ${u.pairedAt})`);
      }
    }
    break;
  }

  case "status": {
    console.log(`Bot token: ${token ? "configured" : "not set"}`);
    console.log(`Paired users: ${config.pairedUsers.length}`);
    try {
      const me = await telegramApi(token, "getMe", {}) as { username?: string; first_name?: string };
      console.log(`Bot: @${me.username ?? me.first_name ?? "unknown"}`);
      console.log("Status: online");
    } catch {
      console.log("Status: cannot reach Telegram API");
    }
    break;
  }

  default:
    console.log("Usage: run.ts <send|send-image|send-file|users|status> [options]");
    console.log("\nCommands:");
    console.log("  send        Send a text message");
    console.log("  send-image  Send an image (file or URL)");
    console.log("  send-file   Send a document/file");
    console.log("  users       List paired users");
    console.log("  status      Check bot status");
}
