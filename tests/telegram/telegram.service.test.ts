import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TelegramStoreService } from "../../src/channels/adapters/telegram-store.service.js";

describe("TelegramStoreService", () => {
  let tmpDir: string;
  let store: TelegramStoreService;

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-tg-test-")); store = new TelegramStoreService(tmpDir); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("returns undefined token when no config", () => {
    expect(store.getBotToken()).toBeUndefined();
  });

  it("sets and gets bot token", () => {
    store.setBotToken("test-token-123");
    expect(store.getBotToken()).toBe("test-token-123");
  });

  it("manages paired users", () => {
    expect(store.isUserPaired(123)).toBe(false);
    store.addPairedUser(123, "testuser");
    expect(store.isUserPaired(123)).toBe(true);
    expect(store.removePairedUser(123)).toBe(true);
    expect(store.isUserPaired(123)).toBe(false);
  });

  it("generates and validates pairing codes", () => {
    const code = store.generatePairingCode();
    expect(code.code).toHaveLength(6);
    expect(store.validatePairingCode(code.code)).toBe(true);
    // Code should be consumed
    expect(store.validatePairingCode(code.code)).toBe(false);
  });

  it("rejects invalid pairing codes", () => {
    expect(store.validatePairingCode("000000")).toBe(false);
  });

  it("does not add duplicate users", () => {
    store.addPairedUser(123, "user");
    store.addPairedUser(123, "user");
    const config = store.load();
    expect(config.pairedUsers.filter(u => u.telegramId === 123)).toHaveLength(1);
  });
});
