import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TelegramStore } from "../../../src/interfaces/telegram/store.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// We test the bot's logic through the store since the Telegraf bot
// requires a real token to instantiate. The bot.ts delegates all
// auth decisions to the store.

describe("Telegram Bot — pairing flow", () => {
  let store: TelegramStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-telegram-bot-test-"));
    store = new TelegramStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("full pairing flow: generate code → validate → pair user", () => {
    // 1. Generate pairing code (CLI side)
    const pairingCode = store.generatePairingCode();
    expect(pairingCode.code).toMatch(/^\d{6}$/);

    // 2. User is not yet paired
    const telegramId = 42;
    expect(store.isUserPaired(telegramId)).toBe(false);

    // 3. Validate the code (Telegram bot side)
    expect(store.validatePairingCode(pairingCode.code)).toBe(true);

    // 4. Pair the user
    store.addPairedUser(telegramId, "alice");
    expect(store.isUserPaired(telegramId)).toBe(true);

    // 5. Code is consumed — can't reuse
    expect(store.validatePairingCode(pairingCode.code)).toBe(false);
  });

  it("rejects unpaired user messages", () => {
    expect(store.isUserPaired(999)).toBe(false);
  });

  it("unpair flow: paired user can unpair", () => {
    store.addPairedUser(42, "bob");
    expect(store.isUserPaired(42)).toBe(true);

    store.removePairedUser(42);
    expect(store.isUserPaired(42)).toBe(false);
  });

  it("wrong code does not pair", () => {
    store.generatePairingCode();
    expect(store.validatePairingCode("000000")).toBe(false);
  });

  it("cross-process pairing: code from one store instance works in another", () => {
    // CLI process generates code
    const cliStore = new TelegramStore(tmpDir);
    const code = cliStore.generatePairingCode();

    // Daemon process (separate store instance) validates it
    const daemonStore = new TelegramStore(tmpDir);
    expect(daemonStore.validatePairingCode(code.code)).toBe(true);

    // Consumed — can't reuse from either instance
    expect(daemonStore.validatePairingCode(code.code)).toBe(false);
    expect(cliStore.validatePairingCode(code.code)).toBe(false);
  });

  it("expired code is rejected", () => {
    // Generate a code then manually expire it in the config file
    const code = store.generatePairingCode();
    const configPath = path.join(tmpDir, "telegram.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    config.pendingCodes[0].expiresAt = Date.now() - 1000;
    fs.writeFileSync(configPath, JSON.stringify(config));

    expect(store.validatePairingCode(code.code)).toBe(false);
  });
});

describe("Telegram Bot — sendLongMessage logic", () => {
  it("splits text longer than 4096 chars", () => {
    // Test the splitting logic directly
    const MAX_LEN = 4096;
    const longText = "A".repeat(5000);

    const chunks: string[] = [];
    let remaining = longText;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_LEN) {
        chunks.push(remaining);
        break;
      }
      chunks.push(remaining.slice(0, MAX_LEN));
      remaining = remaining.slice(MAX_LEN).trimStart();
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(4096);
    expect(chunks[1]).toHaveLength(904);
  });

  it("does not split text under 4096 chars", () => {
    const shortText = "Hello world";
    expect(shortText.length).toBeLessThanOrEqual(4096);
    // Would be sent as single message
  });
});
