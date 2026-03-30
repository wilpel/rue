import * as fs from "node:fs";
import * as path from "node:path";

export interface PairedUser {
  telegramId: number;
  telegramUsername?: string;
  pairedAt: string;
}

export interface PairingCode {
  code: string;
  createdAt: number;
  expiresAt: number;
}

export interface TelegramConfig {
  botToken?: string;
  pairedUsers: PairedUser[];
  pendingCodes?: PairingCode[];
}

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class TelegramStore {
  private readonly configPath: string;
  // @ts-ignore TS6133 — field IS used in methods below
  private readonly pendingCodes: Map<string, PairingCode> = new Map();

  constructor(dataDir: string) {
    this.configPath = path.join(dataDir, "telegram.json");
    fs.mkdirSync(dataDir, { recursive: true });
  }

  load(): TelegramConfig {
    if (!fs.existsSync(this.configPath)) {
      return { pairedUsers: [], pendingCodes: [] };
    }
    return JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
  }

  save(config: TelegramConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  getBotToken(): string | undefined {
    // 1. Environment variable
    if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;

    // 2. Try encrypted vault
    try {
      const { execSync } = require("node:child_process");
      const vaultPath = require("node:path").join(require("node:os").homedir(), ".rue", "vault.enc");
      const fs = require("node:fs");
      if (fs.existsSync(vaultPath)) {
        const result = execSync("node --import tsx/esm skills/secrets/run.ts get --key TELEGRAM_BOT_TOKEN 2>/dev/null", { encoding: "utf-8", cwd: process.cwd() }).trim();
        if (result) return result;
      }
    } catch { /* vault not available or key not found */ }

    // 3. Fall back to plain config (legacy)
    const config = this.load();
    return config.botToken;
  }

  setBotToken(token: string): void {
    // Store in plain config (legacy)
    const config = this.load();
    config.botToken = token;
    this.save(config);

    // Also try to store in vault
    try {
      const { execSync } = require("node:child_process");
      execSync(`node --import tsx/esm skills/secrets/run.ts set --key TELEGRAM_BOT_TOKEN --value "${token}"`, { encoding: "utf-8", cwd: process.cwd() });
    } catch { /* vault not available */ }
  }

  getPairedUsers(): PairedUser[] {
    return this.load().pairedUsers;
  }

  isUserPaired(telegramId: number): boolean {
    return this.load().pairedUsers.some((u) => u.telegramId === telegramId);
  }

  addPairedUser(telegramId: number, username?: string): void {
    const config = this.load();
    if (config.pairedUsers.some((u) => u.telegramId === telegramId)) {
      return; // already paired
    }
    config.pairedUsers.push({
      telegramId,
      telegramUsername: username,
      pairedAt: new Date().toISOString(),
    });
    this.save(config);
  }

  removePairedUser(telegramId: number): boolean {
    const config = this.load();
    const before = config.pairedUsers.length;
    config.pairedUsers = config.pairedUsers.filter((u) => u.telegramId !== telegramId);
    if (config.pairedUsers.length === before) return false;
    this.save(config);
    return true;
  }

  // ── Pairing codes (persisted to disk for cross-process access) ──

  generatePairingCode(): PairingCode {
    const config = this.load();
    this.cleanExpiredCodes(config);

    const code = this.randomCode();
    const now = Date.now();
    const pairingCode: PairingCode = {
      code,
      createdAt: now,
      expiresAt: now + PAIRING_CODE_TTL_MS,
    };

    if (!config.pendingCodes) config.pendingCodes = [];
    config.pendingCodes.push(pairingCode);
    this.save(config);
    return pairingCode;
  }

  validatePairingCode(code: string): boolean {
    const config = this.load();
    this.cleanExpiredCodes(config);

    const idx = config.pendingCodes?.findIndex((c) => c.code === code) ?? -1;
    if (idx === -1) return false;

    // Code is valid — consume it
    config.pendingCodes!.splice(idx, 1);
    this.save(config);
    return true;
  }

  private cleanExpiredCodes(config: TelegramConfig): void {
    const now = Date.now();
    config.pendingCodes = (config.pendingCodes ?? []).filter(
      (c) => c.expiresAt > now,
    );
  }

  private randomCode(): string {
    // 6-digit numeric code
    return String(Math.floor(100000 + Math.random() * 900000));
  }
}
