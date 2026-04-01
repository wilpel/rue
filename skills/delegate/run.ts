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
  const name = getArg("name");
  const chatId = getArg("chat-id");
  const messageId = getArg("message-id");

  if (!task) {
    console.error("Error: --task is required");
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
        name,
        chatId: chatId ? parseInt(chatId, 10) : 0,
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
} else if (command === "status") {
  const agentId = getArg("id");
  const config = loadConfig();

  try {
    const url = agentId
      ? `http://127.0.0.1:${config.port}/api/delegates/${encodeURIComponent(agentId)}`
      : `http://127.0.0.1:${config.port}/api/delegates`;

    const res = await fetch(url);
    const data = await res.json() as Record<string, unknown>;

    if (agentId) {
      // Single agent
      console.log(`Agent: ${data.id}`);
      console.log(`Task: ${data.task}`);
      console.log(`Status: ${data.status}`);
      if (data.runningFor) console.log(`Running for: ${data.runningFor}`);
      const activity = (data.activity ?? []) as string[];
      if (activity.length > 0) {
        console.log(`Activity (${activity.length} steps):`);
        for (const a of activity) console.log(`  - ${a}`);
      }
      if (data.result) console.log(`Result: ${(data.result as string).slice(0, 500)}`);
    } else {
      // All agents
      const agents = (data.agents ?? []) as Array<Record<string, unknown>>;
      if (agents.length === 0) {
        console.log("No delegate agents (running or recent).");
      } else {
        for (const a of agents) {
          const status = a.status === "running" ? `running (${a.runningFor})` : a.status;
          const activity = (a.activity ?? []) as string[];
          const lastStep = activity.length > 0 ? ` | last: ${activity[activity.length - 1]}` : "";
          console.log(`[${a.id}] ${status} — ${(a.task as string).slice(0, 80)}${lastStep}`);
          if (a.result) console.log(`  Result: ${(a.result as string).slice(0, 150)}`);
        }
      }
    }
  } catch (err) {
    console.error(`Failed to reach daemon: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
} else {
  console.log("Usage:");
  console.log("  delegate spawn  --task \"...\" --name \"Web researcher\" --chat-id 12345 [--message-id 67890]");
  console.log("  delegate status [--id <agent-id>]");
}
