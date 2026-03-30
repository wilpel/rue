#!/usr/bin/env tsx

/**
 * Delegate skill — spawns a background Claude agent via the daemon.
 * The result is automatically sent back to the user (e.g., via Telegram).
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

function getArg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function loadConfig(): { port: number } {
  const configPath = path.join(os.homedir(), ".rue", "config.json");
  if (fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return { port: raw.port ?? 18800 };
  }
  return { port: 18800 };
}

const command = process.argv[2];

if (command === "spawn") {
  const task = getArg("task");
  const chatId = getArg("chat-id");
  const messageId = getArg("message-id");

  if (!task) {
    console.error("Error: --task is required");
    process.exit(1);
  }
  if (!chatId) {
    console.error("Error: --chat-id is required");
    process.exit(1);
  }

  const config = loadConfig();
  const url = `http://127.0.0.1:${config.port}/api/delegate`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task,
        chatId: parseInt(chatId, 10),
        messageId: messageId ? parseInt(messageId, 10) : undefined,
      }),
    });

    const data = await res.json() as Record<string, unknown>;
    if (data.ok) {
      console.log(`Delegated: ${data.agentId}`);
    } else {
      console.error(`Failed: ${data.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Failed to reach daemon: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
} else {
  console.log("Usage: delegate spawn --task \"...\" --chat-id 12345 [--message-id 67890]");
}
