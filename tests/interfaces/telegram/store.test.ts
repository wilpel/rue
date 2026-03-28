import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TelegramStore } from "../../../src/interfaces/telegram/store.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("TelegramStore", () => {
  let store: TelegramStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-telegram-test-"));
    store = new TelegramStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("bot token", () => {
    it("returns undefined when no token set", () => {
      expect(store.getBotToken()).toBeUndefined();
    });

    it("saves and loads bot token", () => {
      store.setBotToken("123:ABC");
      expect(store.getBotToken()).toBe("123:ABC");

      // Survives reload
      const store2 = new TelegramStore(tmpDir);
      expect(store2.getBotToken()).toBe("123:ABC");
    });

    it("overwrites existing token", () => {
      store.setBotToken("old-token");
      store.setBotToken("new-token");
      expect(store.getBotToken()).toBe("new-token");
    });
  });

  describe("paired users", () => {
    it("starts with no users", () => {
      expect(store.getPairedUsers()).toEqual([]);
    });

    it("adds a user", () => {
      store.addPairedUser(12345, "testuser");
      const users = store.getPairedUsers();
      expect(users).toHaveLength(1);
      expect(users[0].telegramId).toBe(12345);
      expect(users[0].telegramUsername).toBe("testuser");
      expect(users[0].pairedAt).toBeTruthy();
    });

    it("does not duplicate users", () => {
      store.addPairedUser(12345, "testuser");
      store.addPairedUser(12345, "testuser");
      expect(store.getPairedUsers()).toHaveLength(1);
    });

    it("checks if user is paired", () => {
      expect(store.isUserPaired(12345)).toBe(false);
      store.addPairedUser(12345);
      expect(store.isUserPaired(12345)).toBe(true);
    });

    it("removes a user", () => {
      store.addPairedUser(12345, "testuser");
      expect(store.removePairedUser(12345)).toBe(true);
      expect(store.getPairedUsers()).toHaveLength(0);
    });

    it("returns false when removing non-existent user", () => {
      expect(store.removePairedUser(99999)).toBe(false);
    });

    it("handles multiple users", () => {
      store.addPairedUser(111, "user1");
      store.addPairedUser(222, "user2");
      store.addPairedUser(333, "user3");
      expect(store.getPairedUsers()).toHaveLength(3);

      store.removePairedUser(222);
      const remaining = store.getPairedUsers();
      expect(remaining).toHaveLength(2);
      expect(remaining.map((u) => u.telegramId)).toEqual([111, 333]);
    });
  });

  describe("pairing codes", () => {
    it("generates a 6-digit code", () => {
      const code = store.generatePairingCode();
      expect(code.code).toMatch(/^\d{6}$/);
      expect(code.expiresAt).toBeGreaterThan(Date.now());
    });

    it("validates a correct code", () => {
      const code = store.generatePairingCode();
      expect(store.validatePairingCode(code.code)).toBe(true);
    });

    it("rejects an invalid code", () => {
      expect(store.validatePairingCode("000000")).toBe(false);
    });

    it("consumes code on use — single use only", () => {
      const code = store.generatePairingCode();
      expect(store.validatePairingCode(code.code)).toBe(true);
      expect(store.validatePairingCode(code.code)).toBe(false);
    });

    it("generates unique codes", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i++) {
        codes.add(store.generatePairingCode().code);
      }
      // With 6 digits, 20 codes should almost certainly be unique
      expect(codes.size).toBe(20);
    });
  });
});
