import { Injectable, Optional } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";

const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(18800),
  dataDir: z.string().default(path.join(os.homedir(), ".rue")),
  lanes: z
    .object({
      main: z.number().int().min(1).default(1),
      sub: z.number().int().min(1).default(6),
      cron: z.number().int().min(1).default(2),
      skill: z.number().int().min(1).default(2),
    })
    .default({ main: 1, sub: 6, cron: 2, skill: 2 }),
  maxAgents: z.number().int().min(1).default(8),
  stall: z
    .object({
      timeoutMs: z.number().int().min(5000).default(60_000),
      nudgeMs: z.number().int().min(1000).default(30_000),
    })
    .default({ timeoutMs: 60_000, nudgeMs: 30_000 }),
  budgets: z
    .object({
      dailyCeiling: z.number().min(0).default(10),
    })
    .default({ dailyCeiling: 10 }),
  models: z.object({
    primary: z.string().default("opus"),
    fallback: z.array(z.string()).default(["sonnet"]),
  }).default({ primary: "opus", fallback: ["sonnet"] }),
  sessions: z.object({
    messageTtlDays: z.number().int().min(1).default(30),
    maxMessagesPerChat: z.number().int().min(10).default(500),
    vacuumAfterCleanup: z.boolean().default(true),
  }).default({ messageTtlDays: 30, maxMessagesPerChat: 500, vacuumAfterCleanup: true }),
  debounce: z.object({
    textGapMs: z.number().int().min(100).default(2000),
    mediaGapMs: z.number().int().min(10).default(100),
    maxFragments: z.number().int().min(1).default(12),
    maxChars: z.number().int().min(100).default(10000),
  }).default({ textGapMs: 2000, mediaGapMs: 100, maxFragments: 12, maxChars: 10000 }),
  routes: z.array(z.object({
    match: z.object({
      channel: z.string().optional(),
      chatId: z.string().optional(),
      chatType: z.enum(["direct", "group"]).optional(),
    }),
    agent: z.string(),
  })).default([]),
  agents: z.record(z.string(), z.object({
    systemPrompt: z.string(),
    personality: z.string().optional(),
    tools: z.array(z.string()),
  })).default({
    default: { systemPrompt: "prompts/SYSTEM.md", personality: "prompts/PERSONALITY.md", tools: ["Bash"] },
  }),
});

type RueConfig = z.infer<typeof ConfigSchema>;

@Injectable()
export class ConfigService {
  private readonly config: RueConfig;

  constructor(@Optional() configPath?: string) {
    const filePath = configPath ?? path.join(os.homedir(), ".rue", "config.json");
    this.config = this.load(filePath);
  }

  get port(): number { return this.config.port; }
  get dataDir(): string { return this.config.dataDir; }
  get lanes(): RueConfig["lanes"] { return this.config.lanes; }
  get maxAgents(): number { return this.config.maxAgents; }
  get stall(): RueConfig["stall"] { return this.config.stall; }
  get budgets(): RueConfig["budgets"] { return this.config.budgets; }
  get models(): RueConfig["models"] { return this.config.models; }
  get sessions(): RueConfig["sessions"] { return this.config.sessions; }
  get debounce(): RueConfig["debounce"] { return this.config.debounce; }
  get routes(): RueConfig["routes"] { return this.config.routes; }
  get agents(): RueConfig["agents"] { return this.config.agents; }

  private load(filePath: string): RueConfig {
    if (!fs.existsSync(filePath)) {
      return ConfigSchema.parse({});
    }
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return ConfigSchema.parse(raw);
  }
}
