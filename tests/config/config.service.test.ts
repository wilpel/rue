import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ConfigService } from "../../src/config/config.service.js";

describe("ConfigService", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const svc = new ConfigService(path.join(tmpDir, "config.json"));
    expect(svc.port).toBe(18800);
    expect(svc.dataDir).toContain(".rue");
  });

  it("loads config from file", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ port: 9999 }));
    const svc = new ConfigService(configPath);
    expect(svc.port).toBe(9999);
  });

  it("validates config and throws on invalid port", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ port: -1 }));
    expect(() => new ConfigService(configPath)).toThrow();
  });

  it("exposes all config fields", () => {
    const svc = new ConfigService(path.join(tmpDir, "nonexistent.json"));
    expect(svc.lanes).toEqual({ main: 1, sub: 6, cron: 2, skill: 2 });
    expect(svc.maxAgents).toBe(8);
    expect(typeof svc.dataDir).toBe("string");
  });
});
