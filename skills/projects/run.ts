#!/usr/bin/env tsx
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { execSync } from "node:child_process";

const projectsDir = path.join(os.homedir(), ".rue", "workspace", "projects");
const eventsDir = path.join(os.homedir(), ".rue", "workspace", "events");
fs.mkdirSync(projectsDir, { recursive: true });
fs.mkdirSync(eventsDir, { recursive: true });

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

interface ProjectConfig {
  name: string;
  description: string;
  maxAgents: number;
  status: "active" | "archived";
  tags: string[];
  created: string;
}

interface TaskFrontmatter {
  id: number;
  status: "todo" | "in-progress" | "done" | "failed";
  created: string;
  agent: string | null;
  started: string | null;
  completed: string | null;
}

function projectPath(name: string): string {
  return path.join(projectsDir, name);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function parseTaskFile(content: string): { frontmatter: TaskFrontmatter; title: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("Invalid task file format");
  const yamlBlock = match[1];
  const rest = match[2].trim();
  const frontmatter: Record<string, unknown> = {};
  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1).trim();
    if (rawVal === "null") {
      frontmatter[key] = null;
    } else if (/^\d+$/.test(rawVal)) {
      frontmatter[key] = parseInt(rawVal, 10);
    } else {
      frontmatter[key] = rawVal;
    }
  }
  const titleMatch = rest.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : "";
  const body = rest.replace(/^#\s+.+\n?/, "").trim();
  return { frontmatter: frontmatter as unknown as TaskFrontmatter, title, body };
}

function serializeTaskFile(fm: TaskFrontmatter, title: string, body: string): string {
  const yamlLines = [
    `id: ${fm.id}`,
    `status: ${fm.status}`,
    `created: ${fm.created}`,
    `agent: ${fm.agent === null ? "null" : fm.agent}`,
    `started: ${fm.started === null ? "null" : fm.started}`,
    `completed: ${fm.completed === null ? "null" : fm.completed}`,
  ];
  const parts = [`---\n${yamlLines.join("\n")}\n---\n\n# ${title}`];
  if (body) parts.push(body);
  return parts.join("\n\n") + "\n";
}

function getTaskFiles(projectName: string): string[] {
  const tasksDir = path.join(projectPath(projectName), "tasks");
  if (!fs.existsSync(tasksDir)) return [];
  return fs
    .readdirSync(tasksDir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

function nextTaskId(projectName: string): number {
  const files = getTaskFiles(projectName);
  if (files.length === 0) return 1;
  const ids = files.map((f) => {
    const m = f.match(/^(\d+)-/);
    return m ? parseInt(m[1], 10) : 0;
  });
  return Math.max(...ids) + 1;
}

switch (command) {
  case "create": {
    const name = getArg("name");
    const description = getArg("description") ?? "";
    const maxAgents = parseInt(getArg("max-agents") ?? "1", 10);
    const gitUrl = getArg("git");

    if (!name) {
      console.error("Usage: run.ts create --name <name> [--description <desc>] [--max-agents <n>] [--git <url>]");
      process.exit(1);
    }

    const projDir = projectPath(name);
    if (fs.existsSync(projDir)) {
      console.error(`Project already exists: ${name}`);
      process.exit(1);
    }

    fs.mkdirSync(projDir, { recursive: true });
    fs.mkdirSync(path.join(projDir, "docs"), { recursive: true });
    fs.mkdirSync(path.join(projDir, "tasks"), { recursive: true });
    fs.mkdirSync(path.join(projDir, "work"), { recursive: true });

    const config: ProjectConfig = {
      name,
      description,
      maxAgents,
      status: "active",
      tags: [],
      created: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(projDir, "config.json"), JSON.stringify(config, null, 2) + "\n");

    fs.writeFileSync(
      path.join(projDir, "PROJECT.md"),
      `# ${name}\n\n${description || "TODO: describe this project — goals, context, approach."}\n`,
    );

    fs.writeFileSync(
      path.join(projDir, "AGENTS.md"),
      `# Agent Instructions — ${name}\n\n## Guidelines\n\n- Work inside the \`work/\` directory\n- Keep \`docs/notes.md\` updated with discoveries\n- One task per session — complete it fully before stopping\n- Commit changes with descriptive messages\n`,
    );

    fs.writeFileSync(
      path.join(projDir, "docs", "notes.md"),
      `# Notes — ${name}\n\nDocument discoveries, decisions, and progress here.\n`,
    );

    if (gitUrl) {
      console.log(`Cloning ${gitUrl} into work/...`);
      execSync(`git clone ${gitUrl} .`, { cwd: path.join(projDir, "work"), stdio: "inherit" });
    }

    console.log(`Created project: ${name}`);
    console.log(`  Path: ${projDir}`);
    console.log(`  Description: ${description || "(none)"}`);
    console.log(`  Max agents: ${maxAgents}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Edit PROJECT.md with goals and context`);
    console.log(`  2. Edit AGENTS.md with project-specific instructions`);
    console.log(`  3. Add tasks with: run.ts add-task --project ${name} --task "..."`);
    break;
  }

  case "list": {
    if (!fs.existsSync(projectsDir)) {
      console.log("No projects found.");
      break;
    }
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (entries.length === 0) {
      console.log("No projects found.");
      break;
    }
    console.log(`${entries.length} project(s):\n`);
    for (const entry of entries) {
      const configFile = path.join(projectsDir, entry.name, "config.json");
      if (!fs.existsSync(configFile)) continue;
      const config: ProjectConfig = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      const taskFiles = getTaskFiles(entry.name);
      const counts = { todo: 0, "in-progress": 0, done: 0, failed: 0 };
      for (const tf of taskFiles) {
        const content = fs.readFileSync(path.join(projectsDir, entry.name, "tasks", tf), "utf-8");
        try {
          const { frontmatter } = parseTaskFile(content);
          counts[frontmatter.status] = (counts[frontmatter.status] ?? 0) + 1;
        } catch {
          // skip malformed
        }
      }
      const taskSummary = `${counts.todo} todo, ${counts["in-progress"]} in-progress, ${counts.done} done`;
      console.log(`  ${config.name} [${config.status}]`);
      console.log(`    ${config.description || "(no description)"}`);
      console.log(`    Tasks: ${taskSummary}`);
      console.log(`    Max agents: ${config.maxAgents}\n`);
    }
    break;
  }

  case "status": {
    const name = getArg("project");
    if (!name) {
      console.error("Usage: run.ts status --project <name>");
      process.exit(1);
    }
    const projDir = projectPath(name);
    if (!fs.existsSync(projDir)) {
      console.error(`Project not found: ${name}`);
      process.exit(1);
    }
    const config: ProjectConfig = JSON.parse(fs.readFileSync(path.join(projDir, "config.json"), "utf-8"));
    console.log(`Project: ${config.name} [${config.status}]`);
    console.log(`  Description: ${config.description || "(none)"}`);
    console.log(`  Max agents: ${config.maxAgents}`);
    console.log(`  Created: ${config.created}`);

    const taskFiles = getTaskFiles(name);
    if (taskFiles.length === 0) {
      console.log("\nNo tasks.");
    } else {
      console.log(`\nTasks (${taskFiles.length}):\n`);
      for (const tf of taskFiles) {
        const content = fs.readFileSync(path.join(projDir, "tasks", tf), "utf-8");
        try {
          const { frontmatter, title } = parseTaskFile(content);
          const agentStr = frontmatter.agent ? ` | agent: ${frontmatter.agent}` : "";
          console.log(`  [${frontmatter.id}] ${title} — ${frontmatter.status}${agentStr}`);
        } catch {
          console.log(`  ${tf} — (parse error)`);
        }
      }
    }
    break;
  }

  case "add-task": {
    const name = getArg("project");
    const taskTitle = getArg("task");
    const taskDescription = getArg("description") ?? "";
    if (!name || !taskTitle) {
      console.error("Usage: run.ts add-task --project <name> --task <title> [--description <desc>]");
      process.exit(1);
    }
    const projDir = projectPath(name);
    if (!fs.existsSync(projDir)) {
      console.error(`Project not found: ${name}`);
      process.exit(1);
    }

    const id = nextTaskId(name);
    const paddedId = String(id).padStart(3, "0");
    const slug = slugify(taskTitle);
    const filename = `${paddedId}-${slug}.md`;
    const now = new Date().toISOString();

    const fm: TaskFrontmatter = {
      id,
      status: "todo",
      created: now,
      agent: null,
      started: null,
      completed: null,
    };
    const content = serializeTaskFile(fm, taskTitle, taskDescription);
    fs.writeFileSync(path.join(projDir, "tasks", filename), content);

    // Emit trigger event
    const event = {
      type: "task-added",
      project: name,
      taskId: id,
      taskTitle,
      taskFile: filename,
      timestamp: now,
    };
    fs.writeFileSync(path.join(eventsDir, "task-added.json"), JSON.stringify(event, null, 2) + "\n");

    console.log(`Added task #${id}: ${taskTitle}`);
    console.log(`  File: tasks/${filename}`);
    console.log(`  Event emitted: events/task-added.json`);
    break;
  }

  case "update-task": {
    const name = getArg("project");
    const taskIdStr = getArg("task");
    const status = getArg("status") as TaskFrontmatter["status"] | undefined;
    const agent = getArg("agent");

    if (!name || !taskIdStr) {
      console.error("Usage: run.ts update-task --project <name> --task <id> --status <status> [--agent <id>]");
      process.exit(1);
    }
    const projDir = projectPath(name);
    if (!fs.existsSync(projDir)) {
      console.error(`Project not found: ${name}`);
      process.exit(1);
    }

    const taskId = parseInt(taskIdStr, 10);
    const taskFiles = getTaskFiles(name);
    const taskFile = taskFiles.find((f) => f.startsWith(String(taskId).padStart(3, "0") + "-"));
    if (!taskFile) {
      console.error(`Task not found: #${taskId}`);
      process.exit(1);
    }

    const filePath = path.join(projDir, "tasks", taskFile);
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, title, body } = parseTaskFile(content);
    const now = new Date().toISOString();

    if (status) frontmatter.status = status;
    if (agent !== undefined) frontmatter.agent = agent;
    if (status === "in-progress" && !frontmatter.started) frontmatter.started = now;
    if ((status === "done" || status === "failed") && !frontmatter.completed) frontmatter.completed = now;

    fs.writeFileSync(filePath, serializeTaskFile(frontmatter, title, body));

    console.log(`Updated task #${taskId}: ${title}`);
    console.log(`  Status: ${frontmatter.status}`);
    if (frontmatter.agent) console.log(`  Agent: ${frontmatter.agent}`);
    break;
  }

  case "archive": {
    const name = getArg("project");
    if (!name) {
      console.error("Usage: run.ts archive --project <name>");
      process.exit(1);
    }
    const projDir = projectPath(name);
    if (!fs.existsSync(projDir)) {
      console.error(`Project not found: ${name}`);
      process.exit(1);
    }
    const configPath = path.join(projDir, "config.json");
    const config: ProjectConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    config.status = "archived";
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`Archived project: ${name}`);
    break;
  }

  default:
    console.log("Usage: run.ts <create|list|status|add-task|update-task|archive> [options]");
    console.log("Run with --help on any command for details.");
}
