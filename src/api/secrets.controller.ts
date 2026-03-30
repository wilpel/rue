import { Controller, Get, Post, Delete, Param, Body } from "@nestjs/common";
import { execSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

@Controller("api/secrets")
export class SecretsController {
  @Get()
  listSecrets() {
    try {
      const output = execSync("node --import tsx/esm skills/secrets/run.ts list", { cwd: PROJECT_ROOT, encoding: "utf-8" });
      const keys = output.split("\n").filter((l: string) => l.trim().startsWith("  ")).map((l: string) => l.trim());
      return { keys };
    } catch { return { keys: [] }; }
  }

  @Post()
  setSecret(@Body() body: { key: string; value: string }) {
    if (!body.key || !body.value) return { error: "key and value required" };
    try {
      execSync(`node --import tsx/esm skills/secrets/run.ts set --key "${body.key.replace(/"/g, '\\"')}" --value "${body.value.replace(/"/g, '\\"')}"`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
      return { ok: true };
    } catch (err) { return { error: err instanceof Error ? err.message : "Failed" }; }
  }

  @Delete(":key")
  deleteSecret(@Param("key") key: string) {
    try {
      execSync(`node --import tsx/esm skills/secrets/run.ts delete --key "${key}"`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
      return { ok: true };
    } catch { return { error: "Failed to delete" }; }
  }
}
