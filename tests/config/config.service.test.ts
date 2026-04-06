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

  it("has default models config", () => {
    const config = new ConfigService(path.join(tmpDir, "nonexistent.json"));
    expect(config.models.primary).toBe("sonnet");
    expect(config.models.fallback).toEqual(["sonnet"]);
    expect(config.models.delegate).toEqual({ trivial: "haiku", low: "sonnet", medium: "sonnet", hard: "opus" });
  });

  it("has default heartbeat config", () => {
    const config = new ConfigService(path.join(tmpDir, "nonexistent.json"));
    expect(config.heartbeat.enabled).toBe(true);
    expect(config.heartbeat.intervalMs).toBe(1_800_000);
  });

  it("has default workspace config", () => {
    const config = new ConfigService(path.join(tmpDir, "nonexistent.json"));
    expect(config.workspace.enabled).toBe(true);
    expect(config.workspace.tickMs).toBe(15_000);
    expect(config.workspace.maxSignals).toBe(50);
    expect(config.workspace.topN).toBe(5);
  });

  it("has default consolidation config", () => {
    const config = new ConfigService(path.join(tmpDir, "nonexistent.json"));
    expect(config.consolidation.triage.enabled).toBe(true);
    expect(config.consolidation.triage.intervalMs).toBe(7_200_000);
    expect(config.consolidation.consolidation.enabled).toBe(true);
    expect(config.consolidation.consolidation.intervalMs).toBe(86_400_000);
    expect(config.consolidation.synthesis.enabled).toBe(true);
    expect(config.consolidation.synthesis.intervalMs).toBe(604_800_000);
  });

  it("has default sessions config", () => {
    const config = new ConfigService(path.join(tmpDir, "nonexistent.json"));
    expect(config.sessions.messageTtlDays).toBe(30);
    expect(config.sessions.maxMessagesPerChat).toBe(500);
    expect(config.sessions.preCompactionSave).toBe(true);
  });

  it("has default debounce config", () => {
    const config = new ConfigService(path.join(tmpDir, "nonexistent.json"));
    expect(config.debounce.textGapMs).toBe(2000);
    expect(config.debounce.mediaGapMs).toBe(100);
  });

  it("has empty routes by default", () => {
    const config = new ConfigService(path.join(tmpDir, "nonexistent.json"));
    expect(config.routes).toEqual([]);
  });

  it("has default agent config", () => {
    const config = new ConfigService(path.join(tmpDir, "nonexistent.json"));
    expect(config.agents.default.systemPrompt).toBe("prompts/SYSTEM.md");
    expect(config.agents.default.tools).toEqual(["Bash"]);
  });
});
