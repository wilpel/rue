import { Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";

export interface PairedUser { telegramId: number; telegramUsername?: string; pairedAt: string; }
export interface PairingCode { code: string; createdAt: number; expiresAt: number; }
interface TelegramConfig { botToken?: string; pairedUsers: PairedUser[]; pendingCodes?: PairingCode[]; }

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class TelegramStoreService {
  private readonly configPath: string;

  constructor(dataDir: string) {
    this.configPath = path.join(dataDir, "telegram.json");
    fs.mkdirSync(dataDir, { recursive: true });
  }

  load(): TelegramConfig {
    if (!fs.existsSync(this.configPath)) return { pairedUsers: [], pendingCodes: [] };
    return JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
  }

  save(config: TelegramConfig): void { fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2)); }

  getBotToken(): string | undefined {
    if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
    return this.load().botToken;
  }

  setBotToken(token: string): void { const config = this.load(); config.botToken = token; this.save(config); }

  getPairedUsers(): PairedUser[] { return this.load().pairedUsers; }

  isUserPaired(telegramId: number): boolean { return this.load().pairedUsers.some(u => u.telegramId === telegramId); }

  addPairedUser(telegramId: number, username?: string): void {
    const config = this.load();
    if (config.pairedUsers.some(u => u.telegramId === telegramId)) return;
    config.pairedUsers.push({ telegramId, telegramUsername: username, pairedAt: new Date().toISOString() });
    this.save(config);
  }

  removePairedUser(telegramId: number): boolean {
    const config = this.load();
    const before = config.pairedUsers.length;
    config.pairedUsers = config.pairedUsers.filter(u => u.telegramId !== telegramId);
    if (config.pairedUsers.length === before) return false;
    this.save(config);
    return true;
  }

  generatePairingCode(): PairingCode {
    const config = this.load();
    this.cleanExpiredCodes(config);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const now = Date.now();
    const pairingCode: PairingCode = { code, createdAt: now, expiresAt: now + PAIRING_CODE_TTL_MS };
    if (!config.pendingCodes) config.pendingCodes = [];
    config.pendingCodes.push(pairingCode);
    this.save(config);
    return pairingCode;
  }

  validatePairingCode(code: string): boolean {
    const config = this.load();
    this.cleanExpiredCodes(config);
    const idx = config.pendingCodes?.findIndex(c => c.code === code) ?? -1;
    if (idx === -1) return false;
    config.pendingCodes!.splice(idx, 1);
    this.save(config);
    return true;
  }

  private cleanExpiredCodes(config: TelegramConfig): void {
    const now = Date.now();
    config.pendingCodes = (config.pendingCodes ?? []).filter(c => c.expiresAt > now);
  }
}
