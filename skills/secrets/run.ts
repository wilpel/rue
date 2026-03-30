#!/usr/bin/env tsx
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const DATA_DIR = path.join(os.homedir(), ".rue");
const VAULT_PATH = path.join(DATA_DIR, "vault.enc");
const KEY_FILE = path.join(DATA_DIR, "vault-key");

fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Crypto helpers ──────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;

interface VaultData {
  salt: string; // hex
  secrets: Record<string, EncryptedValue>;
}

interface EncryptedValue {
  iv: string;   // hex
  tag: string;  // hex
  data: string; // hex
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

function encrypt(plaintext: string, key: Buffer): EncryptedValue {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  };
}

function decrypt(enc: EncryptedValue, key: Buffer): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(enc.iv, "hex"));
  decipher.setAuthTag(Buffer.from(enc.tag, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(enc.data, "hex")), decipher.final()]);
  return decrypted.toString("utf-8");
}

// ── Vault operations ────────────────────────────────────────

function getPassphrase(): string {
  // Check env var first
  if (process.env.RUE_VAULT_PASSPHRASE) return process.env.RUE_VAULT_PASSPHRASE;
  // Check key file
  if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, "utf-8").trim();
  // Fallback: use a machine-specific default (less secure but works without setup)
  return `rue-vault-${os.hostname()}-${os.userInfo().username}`;
}

function loadVault(): { vault: VaultData; key: Buffer } {
  const passphrase = getPassphrase();

  if (!fs.existsSync(VAULT_PATH)) {
    // Create new vault
    const salt = crypto.randomBytes(SALT_LENGTH);
    const vault: VaultData = { salt: salt.toString("hex"), secrets: {} };
    const key = deriveKey(passphrase, salt);
    return { vault, key };
  }

  const raw = JSON.parse(fs.readFileSync(VAULT_PATH, "utf-8")) as VaultData;
  const salt = Buffer.from(raw.salt, "hex");
  const key = deriveKey(passphrase, salt);
  return { vault: raw, key };
}

function saveVault(vault: VaultData): void {
  fs.writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2), { mode: 0o600 });
}

// ── CLI ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

switch (command) {
  case "init": {
    if (fs.existsSync(VAULT_PATH)) {
      console.log("Vault already exists at", VAULT_PATH);
      const { vault } = loadVault();
      console.log(`Contains ${Object.keys(vault.secrets).length} secret(s).`);
    } else {
      const { vault } = loadVault();
      saveVault(vault);
      console.log("Vault initialized at", VAULT_PATH);
      console.log("Set RUE_VAULT_PASSPHRASE env var or create ~/.rue/vault-key for a custom passphrase.");
    }
    break;
  }

  case "set": {
    const key = getArg("key");
    const value = getArg("value");
    if (!key || !value) {
      console.error("Usage: run.ts set --key <name> --value <secret>");
      process.exit(1);
    }
    const { vault, key: encKey } = loadVault();
    vault.secrets[key] = encrypt(value, encKey);
    saveVault(vault);
    console.log(`Secret stored: ${key}`);
    break;
  }

  case "get": {
    const key = getArg("key");
    if (!key) {
      console.error("Usage: run.ts get --key <name>");
      process.exit(1);
    }
    const { vault, key: encKey } = loadVault();
    const enc = vault.secrets[key];
    if (!enc) {
      console.error(`Secret not found: ${key}`);
      process.exit(1);
    }
    try {
      const value = decrypt(enc, encKey);
      console.log(value);
    } catch {
      console.error("Failed to decrypt. Wrong passphrase?");
      process.exit(1);
    }
    break;
  }

  case "list": {
    const { vault } = loadVault();
    const keys = Object.keys(vault.secrets);
    if (keys.length === 0) {
      console.log("No secrets stored.");
    } else {
      console.log(`${keys.length} secret(s):\n`);
      for (const k of keys.sort()) {
        console.log(`  ${k}`);
      }
    }
    break;
  }

  case "has": {
    const key = getArg("key");
    if (!key) { console.error("Usage: run.ts has --key <name>"); process.exit(1); }
    const { vault } = loadVault();
    console.log(key in vault.secrets ? "yes" : "no");
    break;
  }

  case "delete": {
    const key = getArg("key");
    if (!key) { console.error("Usage: run.ts delete --key <name>"); process.exit(1); }
    const { vault } = loadVault();
    if (key in vault.secrets) {
      delete vault.secrets[key];
      saveVault(vault);
      console.log(`Deleted: ${key}`);
    } else {
      console.log(`Not found: ${key}`);
    }
    break;
  }

  default:
    console.log("Usage: run.ts <init|set|get|list|has|delete> [options]");
    console.log("\nCommands:");
    console.log("  init     Initialize the vault");
    console.log("  set      Store a secret (--key <name> --value <secret>)");
    console.log("  get      Retrieve a secret (--key <name>)");
    console.log("  list     List all secret keys (values hidden)");
    console.log("  has      Check if a secret exists (--key <name>)");
    console.log("  delete   Delete a secret (--key <name>)");
}
