import { Controller, Get, Post, Param, Body } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

@Controller("api/projects")
export class ProjectsController {
  private get projectsDir(): string {
    return path.join(os.homedir(), ".rue", "workspace", "projects");
  }

  @Get()
  listProjects() {
    if (!fs.existsSync(this.projectsDir)) return [];
    const entries = fs.readdirSync(this.projectsDir, { withFileTypes: true });
    const projects: unknown[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(this.projectsDir, entry.name, "config.json");
      if (!fs.existsSync(configPath)) continue;
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        projects.push(config);
      } catch { /* skip */ }
    }
    return projects;
  }

  @Get(":name")
  getProject(@Param("name") name: string) {
    const configPath = path.join(this.projectsDir, name, "config.json");
    if (!fs.existsSync(configPath)) return { error: "Project not found" };
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch { return { error: "Failed to read project" }; }
  }

  @Get(":name/tasks")
  getProjectTasks(@Param("name") name: string) {
    const tasksDir = path.join(this.projectsDir, name, "tasks");
    if (!fs.existsSync(tasksDir)) return [];
    const files = fs.readdirSync(tasksDir).filter(f => f.endsWith(".md"));
    return files.map(file => {
      const content = fs.readFileSync(path.join(tasksDir, file), "utf-8");
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const statusMatch = content.match(/status:\s*(\S+)/);
      return { filename: file, title: titleMatch?.[1] ?? file, status: statusMatch?.[1] ?? "todo" };
    });
  }

  @Post()
  createProject(@Body() body: { name: string; description?: string; maxAgents?: number }) {
    if (!body.name) return { error: "name required" };
    try {
      const args = [`--name "${body.name.replace(/"/g, '\\"')}"`];
      if (body.description) args.push(`--description "${body.description.replace(/"/g, '\\"')}"`);
      if (body.maxAgents) args.push(`--max-agents ${body.maxAgents}`);
      execSync(`node --import tsx/esm skills/projects/run.ts create ${args.join(" ")}`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
      return { ok: true };
    } catch (err) { return { error: err instanceof Error ? err.message : "Failed" }; }
  }

  @Post(":name/tasks")
  addTask(@Param("name") name: string, @Body() body: { title: string; description?: string }) {
    if (!body.title) return { error: "title required" };
    try {
      const desc = body.description ? ` --description "${body.description.replace(/"/g, '\\"')}"` : "";
      execSync(`node --import tsx/esm skills/projects/run.ts add-task --project "${name}" --task "${body.title.replace(/"/g, '\\"')}"${desc}`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
      return { ok: true };
    } catch (err) { return { error: err instanceof Error ? err.message : "Failed" }; }
  }
}
