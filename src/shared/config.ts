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
});

export type RueConfig = z.infer<typeof ConfigSchema>;

export const defaultConfig: RueConfig = ConfigSchema.parse({});

export function loadConfig(filePath: string): RueConfig {
  if (!fs.existsSync(filePath)) {
    return defaultConfig;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return ConfigSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid config at ${filePath}:\n${issues}`);
    }
    throw err;
  }
}
