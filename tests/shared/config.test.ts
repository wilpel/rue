import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, defaultConfig, type RueConfig } from "../../src/shared/config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns default config when no file exists", () => {
    const config = loadConfig(path.join(tmpDir, "nonexistent.json"));
    expect(config).toEqual(defaultConfig);
  });

  it("loads config from file and merges with defaults", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ port: 9999 }));
    const config = loadConfig(configPath);
    expect(config.port).toBe(9999);
    expect(config.lanes).toEqual(defaultConfig.lanes);
  });

  it("validates port is a number", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ port: "bad" }));
    expect(() => loadConfig(configPath)).toThrow();
  });

  it("has sensible defaults", () => {
    expect(defaultConfig.port).toBe(18800);
    expect(defaultConfig.lanes.main).toBe(1);
    expect(defaultConfig.lanes.sub).toBe(6);
    expect(defaultConfig.lanes.cron).toBe(2);
    expect(defaultConfig.lanes.skill).toBe(2);
    expect(defaultConfig.maxAgents).toBe(8);
    expect(defaultConfig.dataDir).toContain(".rue");
  });
});
