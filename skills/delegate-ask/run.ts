#!/usr/bin/env tsx

/**
 * Delegate-ask skill — posts a question back to the orchestrator
 * and blocks until an answer is received.
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

const agentId = getArg("agent-id");
const question = getArg("question");

if (!agentId || !question) {
  console.error("Usage: delegate-ask --agent-id <id> --question \"...\"");
  process.exit(1);
}

const config = loadConfig();

// Post question and poll for answer
try {
  const postRes = await fetch(`http://127.0.0.1:${config.port}/api/delegate/${encodeURIComponent(agentId)}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!postRes.ok) {
    console.error(`Failed to post question: ${postRes.status}`);
    process.exit(1);
  }

  // Poll for answer (check every 2 seconds, timeout after 5 minutes)
  const maxWait = 300_000;
  const pollInterval = 2_000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));

    const pollRes = await fetch(`http://127.0.0.1:${config.port}/api/delegate/${encodeURIComponent(agentId)}/answer`);
    const data = await pollRes.json() as { answer?: string; pending?: boolean };

    if (data.answer) {
      console.log(data.answer);
      process.exit(0);
    }
  }

  console.error("Timed out waiting for answer");
  process.exit(1);
} catch (err) {
  console.error(`Failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
