#!/usr/bin/env tsx

/**
 * memory-save skill — persist information to Rue's long-term memory systems.
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
const config = loadConfig();
const base = `http://127.0.0.1:${config.port}/api/memory`;

async function post(endpoint: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${base}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as Record<string, unknown>;
  if (data.ok) {
    console.log(`Saved to ${endpoint}.`);
  } else {
    console.error(`Failed: ${data.error}`);
    process.exit(1);
  }
}

if (command === "kb") {
  const pagePath = getArg("path");
  const content = getArg("content");
  const tags = getArg("tags");

  if (!pagePath || !content) {
    console.error("Error: --path and --content are required");
    process.exit(1);
  }

  await post("kb", { path: pagePath, content, tags: tags?.split(",").map(t => t.trim()) });
} else if (command === "fact") {
  const key = getArg("key");
  const content = getArg("content");
  const tags = getArg("tags");

  if (!key || !content) {
    console.error("Error: --key and --content are required");
    process.exit(1);
  }

  await post("fact", { key, content, tags: tags?.split(",").map(t => t.trim()) });
} else if (command === "identity") {
  const field = getArg("field");
  const value = getArg("value");

  if (!field || !value) {
    console.error("Error: --field and --value are required");
    process.exit(1);
  }

  // Try to parse as JSON for arrays/objects, fall back to string
  let parsed: unknown = value;
  try { parsed = JSON.parse(value); } catch { /* use as string */ }

  await post("identity", { field, value: parsed });
} else if (command === "user") {
  const field = getArg("field");
  const value = getArg("value");

  if (!field || !value) {
    console.error("Error: --field and --value are required");
    process.exit(1);
  }

  let parsed: unknown = value;
  try { parsed = JSON.parse(value); } catch { /* use as string */ }

  await post("user", { field, value: parsed });
} else {
  console.log("Usage:");
  console.log("  memory-save kb       --path \"people/john\" --content \"John is...\" [--tags \"colleague,friend\"]");
  console.log("  memory-save fact     --key \"project-deadline\" --content \"Due April 15\" [--tags \"work\"]");
  console.log("  memory-save identity --field \"quirks\" --value '[\"likes puns\"]'");
  console.log("  memory-save user     --field \"name\" --value \"William\"");
}
