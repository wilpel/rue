#!/usr/bin/env tsx
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const DATA_DIR = path.join(os.homedir(), ".rue");
const KEY_FILE = path.join(DATA_DIR, "vault-key");
fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Config ─────────────────────────────────────────────────

function loadConfig(): { port: number; supabaseUrl: string; supabaseKey: string } {
  const configPath = path.join(DATA_DIR, "config.json");
  const defaults = {
    port: 18800,
    supabaseUrl: process.env.SUPABASE_URL ?? "https://fygjocohiiilreitnsnl.supabase.co",
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
  if (fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const supa = (raw.supabase as Record<string, string>) ?? {};
    return {
      port: (raw.port as number) ?? defaults.port,
      supabaseUrl: supa.url ?? defaults.supabaseUrl,
      supabaseKey: supa.serviceRoleKey ?? defaults.supabaseKey,
    };
  }
  return defaults;
}

// ── Crypto helpers ──────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

function getPassphrase(): string {
  if (process.env.RUE_VAULT_PASSPHRASE) return process.env.RUE_VAULT_PASSPHRASE;
  if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, "utf-8").trim();
  return `rue-vault-${os.hostname()}-${os.userInfo().username}`;
}

function deriveKey(passphrase: string): Buffer {
  // Use a fixed salt derived from passphrase for consistency across calls
  const salt = crypto.createHash("sha256").update(`rue-salt-${passphrase}`).digest();
  return crypto.pbkdf2Sync(passphrase, salt, 100_000, KEY_LENGTH, "sha256");
}

function encrypt(plaintext: string, key: Buffer): { iv: string; tag: string; data: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString("hex"), tag: tag.toString("hex"), data: encrypted.toString("hex") };
}

function decrypt(enc: { iv: string; tag: string; data: string }, key: Buffer): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(enc.iv, "hex"));
  decipher.setAuthTag(Buffer.from(enc.tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(enc.data, "hex")), decipher.final()]).toString("utf-8");
}

// ── Supabase helpers ────────────────────────────────────────

const config = loadConfig();

async function supaFetch(method: string, path: string, body?: unknown): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      "apikey": config.supabaseKey,
      "Authorization": `Bearer ${config.supabaseKey}`,
      "Content-Type": "application/json",
      "Prefer": method === "GET" ? "" : "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// ── CLI ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const encKey = deriveKey(getPassphrase());

switch (command) {
  case "set": {
    const key = getArg("key");
    const value = getArg("value");
    if (!key || !value) { console.error("Usage: secrets set --key <name> --value <secret>"); process.exit(1); }
    const enc = encrypt(value, encKey);
    const now = Date.now();
    // Upsert via DELETE + INSERT (Supabase REST doesn't support upsert on all plans easily)
    await supaFetch("DELETE", `secrets_vault?key=eq.${encodeURIComponent(key)}`);
    await supaFetch("POST", "secrets_vault", { key, ...enc, created_at: now, updated_at: now });
    console.log(`Secret stored: ${key}`);
    break;
  }

  case "get": {
    const key = getArg("key");
    if (!key) { console.error("Usage: secrets get --key <name>"); process.exit(1); }
    const rows = await supaFetch("GET", `secrets_vault?key=eq.${encodeURIComponent(key)}&select=iv,tag,data`) as Record<string, string>[];
    if (!rows.length) { console.error(`Secret not found: ${key}`); process.exit(1); }
    try {
      console.log(decrypt(rows[0], encKey));
    } catch { console.error("Failed to decrypt. Wrong passphrase?"); process.exit(1); }
    break;
  }

  case "list": {
    const rows = await supaFetch("GET", "secrets_vault?select=key&order=key") as Record<string, string>[];
    if (rows.length === 0) {
      console.log("No secrets stored.");
    } else {
      console.log(`${rows.length} secret(s):\n`);
      for (const r of rows) console.log(`  ${r.key}`);
    }
    break;
  }

  case "has": {
    const key = getArg("key");
    if (!key) { console.error("Usage: secrets has --key <name>"); process.exit(1); }
    const rows = await supaFetch("GET", `secrets_vault?key=eq.${encodeURIComponent(key)}&select=key`) as Record<string, string>[];
    console.log(rows.length > 0 ? "yes" : "no");
    break;
  }

  case "delete": {
    const key = getArg("key");
    if (!key) { console.error("Usage: secrets delete --key <name>"); process.exit(1); }
    await supaFetch("DELETE", `secrets_vault?key=eq.${encodeURIComponent(key)}`);
    console.log(`Deleted: ${key}`);
    break;
  }

  default:
    console.log("Usage: secrets <set|get|list|has|delete> [options]");
    console.log("\nCommands:");
    console.log("  set      Store a secret (--key <name> --value <secret>)");
    console.log("  get      Retrieve a secret (--key <name>)");
    console.log("  list     List all secret keys (values hidden)");
    console.log("  has      Check if a secret exists (--key <name>)");
    console.log("  delete   Delete a secret (--key <name>)");
}
