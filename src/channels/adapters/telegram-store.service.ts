import { Injectable } from "@nestjs/common";
import type { SupabaseService } from "../../database/supabase.service.js";

export interface PairedUser { telegramId: number; telegramUsername?: string; pairedAt: string; }
export interface PairingCode { code: string; createdAt: number; expiresAt: number; }
interface TelegramConfig { botToken?: string; pairedUsers: PairedUser[]; pendingCodes?: PairingCode[]; }

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class TelegramStoreService {
  private cache: TelegramConfig | null = null;

  constructor(private readonly db: SupabaseService) {}

  async load(): Promise<TelegramConfig> {
    if (this.cache) return this.cache;
    const { data } = await this.db.from("telegram_config").select("data").eq("id", 1).single();
    this.cache = (data?.data as TelegramConfig) ?? { pairedUsers: [], pendingCodes: [] };
    return this.cache;
  }

  async save(config: TelegramConfig): Promise<void> {
    this.cache = config;
    await this.db.from("telegram_config").upsert({ id: 1, data: config });
  }

  async getBotToken(): Promise<string | undefined> {
    if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
    return (await this.load()).botToken;
  }

  async setBotToken(token: string): Promise<void> { const config = await this.load(); config.botToken = token; await this.save(config); }

  async getPairedUsers(): Promise<PairedUser[]> { return (await this.load()).pairedUsers; }

  async isUserPaired(telegramId: number): Promise<boolean> { return (await this.load()).pairedUsers.some(u => u.telegramId === telegramId); }

  async addPairedUser(telegramId: number, username?: string): Promise<void> {
    const config = await this.load();
    if (config.pairedUsers.some(u => u.telegramId === telegramId)) return;
    config.pairedUsers.push({ telegramId, telegramUsername: username, pairedAt: new Date().toISOString() });
    await this.save(config);
  }

  async removePairedUser(telegramId: number): Promise<boolean> {
    const config = await this.load();
    const before = config.pairedUsers.length;
    config.pairedUsers = config.pairedUsers.filter(u => u.telegramId !== telegramId);
    if (config.pairedUsers.length === before) return false;
    await this.save(config);
    return true;
  }

  async generatePairingCode(): Promise<PairingCode> {
    const config = await this.load();
    this.cleanExpiredCodes(config);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const now = Date.now();
    const pairingCode: PairingCode = { code, createdAt: now, expiresAt: now + PAIRING_CODE_TTL_MS };
    if (!config.pendingCodes) config.pendingCodes = [];
    config.pendingCodes.push(pairingCode);
    await this.save(config);
    return pairingCode;
  }

  async validatePairingCode(code: string): Promise<boolean> {
    const config = await this.load();
    this.cleanExpiredCodes(config);
    const idx = config.pendingCodes?.findIndex(c => c.code === code) ?? -1;
    if (idx === -1) return false;
    config.pendingCodes!.splice(idx, 1);
    await this.save(config);
    return true;
  }

  private cleanExpiredCodes(config: TelegramConfig): void {
    const now = Date.now();
    config.pendingCodes = (config.pendingCodes ?? []).filter(c => c.expiresAt > now);
  }
}
