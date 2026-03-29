import { WebSocketServer, type WebSocket } from "ws";
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { EventBus } from "../bus/bus.js";
import { LaneQueue } from "../agents/lanes.js";
import { AgentSupervisor } from "../agents/supervisor.js";
import { Planner } from "../cortex/prefrontal/planner.js";
import { SemanticMemory } from "../cortex/limbic/memory/semantic.js";
import { WorkingMemory } from "../cortex/limbic/memory/working.js";
import { IdentityCore } from "../cortex/limbic/identity/core.js";
import { UserModel } from "../cortex/limbic/identity/user-model.js";
import { ContextAssembler } from "../cortex/limbic/memory/assembler.js";
import { EventPersistence } from "../bus/persistence.js";
import { MessageStore } from "../messages/store.js";
import { createHandler } from "./handler.js";
import { parseClientFrame, serializeDaemonFrame } from "./protocol.js";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { TelegramBot } from "../interfaces/telegram/bot.js";
import { TelegramStore } from "../interfaces/telegram/store.js";
import { JobScheduler } from "./scheduler.js";

// Resolve the rue-bot project root (where SYSTEM.md and skills/ live)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export interface DaemonServerConfig {
  port: number;
  dataDir: string;
}

export class DaemonServer {
  private wss: WebSocketServer | null = null;
  private bus: EventBus;
  private lanes: LaneQueue;
  private supervisor: AgentSupervisor;
  private planner: Planner;
  private httpServer: HttpServer | null = null;
  private persistence: EventPersistence;
  private messages: MessageStore;
  private semantic: SemanticMemory;
  private working: WorkingMemory;
  private identity: IdentityCore;
  private userModel: UserModel;
  private assembler: ContextAssembler;
  private telegramBot: TelegramBot | null = null;
  private scheduler: JobScheduler;

  constructor(private readonly config: DaemonServerConfig) {
    this.bus = new EventBus();
    this.lanes = new LaneQueue({ main: 1, sub: 6, cron: 2, skill: 2 });
    this.supervisor = new AgentSupervisor(this.bus, this.lanes);
    this.persistence = new EventPersistence(path.join(config.dataDir, "events"));
    this.messages = new MessageStore(path.join(config.dataDir, "messages"));
    this.semantic = new SemanticMemory(path.join(config.dataDir, "memory", "semantic"));
    this.working = new WorkingMemory();
    this.identity = new IdentityCore(path.join(config.dataDir, "identity"));
    this.userModel = new UserModel(path.join(config.dataDir, "identity"));
    this.assembler = new ContextAssembler({
      semantic: this.semantic,
      working: this.working,
      identity: this.identity,
      userModel: this.userModel,
      projectDir: PROJECT_ROOT,
    });
    this.planner = new Planner(this.bus, this.supervisor, {
      workdir: process.cwd(),
      defaultTimeout: 300_000,
    });
    this.scheduler = new JobScheduler(
      { schedulesDir: path.join(config.dataDir, "schedules") },
      { bus: this.bus, messages: this.messages },
    );
  }

  async start(): Promise<void> {
    // Use an HTTP server so browsers can upgrade to WebSocket properly
    this.httpServer = createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });
    this.wss = new WebSocketServer({ server: this.httpServer });
    const handler = createHandler({
      projectRoot: PROJECT_ROOT,
      bus: this.bus,
      supervisor: this.supervisor,
      planner: this.planner,
      assembler: this.assembler,
      messages: this.messages,
    });

    this.wss.on("connection", (ws: WebSocket) => {
      ws.on("message", async (data) => {
        try {
          const frame = parseClientFrame(data.toString());
          await handler(frame, ws);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ws.send(serializeDaemonFrame({ type: "error", id: "unknown", code: "PARSE_ERROR", message }));
        }
      });
    });

    // Persist ALL bus events to the event log
    this.bus.onWildcard("", (channel, payload) => {
      this.persistence.append(channel, payload);
    });

    // Reset orphaned in-progress tasks from previous crash/shutdown
    this.resetOrphanedTasks();

    // Watch for task-added events and auto-spawn agents
    this.startTaskWatcher();

    // Start job scheduler to poll for due scheduled jobs
    this.scheduler.start();

    this.bus.emit("system:started", {});
    console.log("[rue] Bus + scheduler started");

    // Start Telegram bot if configured (non-blocking)
    this.startTelegramBot().catch(err => console.error("[rue] Telegram start failed:", err));
    await new Promise<void>((resolve) => {
      this.httpServer!.listen(this.config.port, resolve);
    });
  }

  async stop(): Promise<void> {
    this.bus.emit("system:shutdown", { reason: "shutdown requested" });
    if (this._taskWatcher) clearInterval(this._taskWatcher);
    this.scheduler.stop();
    if (this.telegramBot) await this.telegramBot.stop();
    this.supervisor.shutdown();
    this.semantic.close();
    this.messages.close();
    this.persistence.close();
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.close();
      }
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
      this.wss = null;
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()));
      this.httpServer = null;
    }
  }

  // ── Telegram Bot ────────────────────────────────────────────────────

  private async startTelegramBot(): Promise<void> {
    const store = new TelegramStore(this.config.dataDir);
    const token = store.getBotToken();

    if (!token) {
      console.log("[telegram] No bot token configured — skipping Telegram integration");
      return;
    }

    try {
      this.telegramBot = new TelegramBot({
        botToken: token,
        daemonUrl: `ws://localhost:${this.config.port}`,
        dataDir: this.config.dataDir,
        bus: this.bus,
      });
      await this.telegramBot.start();
      console.log("[telegram] Bot connected and listening");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram] Failed to start bot: ${msg}`);
      this.telegramBot = null;
    }
  }

  // ── HTTP REST API ──────────────────────────────────────────────────

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    const json = (data: unknown, status = 200) => {
      res.writeHead(status, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    try {
      // GET /api/projects
      if (pathname === "/api/projects" && req.method === "GET") {
        json(this.getProjects());
        return;
      }

      // GET /api/projects/:name/tasks
      const tasksMatch = pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
      if (tasksMatch && req.method === "GET") {
        const tasks = this.getProjectTasks(decodeURIComponent(tasksMatch[1]));
        json(tasks);
        return;
      }

      // GET /api/agent-activity
      if (pathname === "/api/agent-activity" && req.method === "GET") {
        import(/* @vite-ignore */ "../../lib/db/helpers" + ".js").then(({ getRecentAgentActivity }) => {
          json(getRecentAgentActivity(30));
        }).catch(() => json([]));
        return;
      }

      // GET /api/projects/:name/docs
      const docsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/docs$/);
      if (docsMatch && req.method === "GET") {
        const docs = this.getProjectDocs(decodeURIComponent(docsMatch[1]));
        json(docs);
        return;
      }

      // GET /api/projects/:name
      const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch && req.method === "GET") {
        const detail = this.getProjectDetail(decodeURIComponent(projectMatch[1]));
        if (!detail) { json({ error: "Project not found" }, 404); return; }
        json(detail);
        return;
      }

      // GET /api/history
      if (pathname === "/api/history" && req.method === "GET") {
        const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
        const messages = this.messages.recent(limit);
        json({ messages });
        return;
      }

      // GET /api/status
      if (pathname === "/api/status" && req.method === "GET") {
        const agents = this.supervisor.listAgents();
        json({
          status: "running",
          agents: agents.map((a) => ({
            id: a.id,
            task: a.config.task,
            state: a.state,
            lane: a.config.lane,
            cost: a.cost,
          })),
        });
        return;
      }

      // GET /api/dashboard — combined data for dashboard page
      if (pathname === "/api/dashboard" && req.method === "GET") {
        const agents = this.supervisor.listAgents();
        const projects = this.getProjects();
        const recentMessages = this.messages.recent(10);
        const events = this.persistence.readTail(30).reverse();
        json({ agents: agents.map(a => ({ id: a.id, task: a.config.task, state: a.state, lane: a.config.lane })), projects, recentMessages, events });
        return;
      }

      // Default: not an API route
      if (pathname.startsWith("/api/")) {
        json({ error: "Not found" }, 404);
        return;
      }

      // Non-API requests — simple health check
      res.writeHead(200, { ...corsHeaders, "Content-Type": "text/plain" });
      res.end("Rue daemon running");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json({ error: message }, 500);
    }
  }

  private get projectsDir(): string {
    return path.join(os.homedir(), ".rue", "workspace", "projects");
  }

  private getProjects(): unknown[] {
    const dir = this.projectsDir;
    if (!fs.existsSync(dir)) return [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const projects: unknown[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(dir, entry.name, "config.json");
      if (!fs.existsSync(configPath)) continue;

      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        const tasks = this.getProjectTasks(entry.name);
        const counts = { todo: 0, "in-progress": 0, done: 0 };
        for (const t of tasks) {
          const s = (t as { status?: string }).status ?? "todo";
          if (s in counts) counts[s as keyof typeof counts]++;
          else counts.todo++;
        }
        projects.push({ ...config, taskCounts: counts });
      } catch {
        // skip malformed project
      }
    }
    return projects;
  }

  private getProjectDetail(name: string): unknown | null {
    const configPath = path.join(this.projectsDir, name, "config.json");
    if (!fs.existsSync(configPath)) return null;

    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const tasks = this.getProjectTasks(name);
      return { ...config, tasks };
    } catch {
      return null;
    }
  }

  private getProjectDocs(name: string): unknown[] {
    const projectDir = path.join(this.projectsDir, name);
    if (!fs.existsSync(projectDir)) return [];

    const docs: Array<{ name: string; path: string; content: string }> = [];

    // Read top-level md files: PROJECT.md, AGENTS.md
    for (const file of ["PROJECT.md", "AGENTS.md"]) {
      const filePath = path.join(projectDir, file);
      if (fs.existsSync(filePath)) {
        docs.push({
          name: file,
          path: file,
          content: fs.readFileSync(filePath, "utf-8"),
        });
      }
    }

    // Read docs/ directory
    const docsDir = path.join(projectDir, "docs");
    if (fs.existsSync(docsDir)) {
      const files = fs.readdirSync(docsDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        docs.push({
          name: file,
          path: `docs/${file}`,
          content: fs.readFileSync(path.join(docsDir, file), "utf-8"),
        });
      }
    }

    return docs;
  }

  private getProjectTasks(name: string): unknown[] {
    const tasksDir = path.join(this.projectsDir, name, "tasks");
    if (!fs.existsSync(tasksDir)) return [];

    const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".md"));
    const tasks: unknown[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(tasksDir, file), "utf-8");
        const task = this.parseTaskFile(file, content);
        tasks.push(task);
      } catch {
        // skip
      }
    }
    return tasks;
  }

  private parseTaskFile(filename: string, content: string): Record<string, unknown> {
    const task: Record<string, unknown> = { filename };

    // Parse YAML frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const yaml = fmMatch[1];
      for (const line of yaml.split("\n")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        // Convert YAML null/empty to actual null
        task[key] = (val === "null" || val === "") ? null : val;
      }
    }

    // Parse markdown title and description
    // Content after frontmatter
    const body = fmMatch ? content.slice(fmMatch[0].length).trim() : content.trim();
    const titleMatch = body.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      task.title = titleMatch[1].trim();
      // Description is everything after the title line
      const afterTitle = body.slice(body.indexOf(titleMatch[0]) + titleMatch[0].length).trim();
      if (afterTitle) {
        task.description = afterTitle;
      }
    }

    if (!task.title) {
      task.title = filename.replace(/\.md$/, "").replace(/-/g, " ");
    }
    if (!task.status) {
      task.status = "todo";
    }

    return task;
  }

  // ── Task Recovery — reset orphaned in-progress tasks on startup ──

  private resetOrphanedTasks(): void {
    if (!fs.existsSync(this.projectsDir)) return;

    const projDirs = fs.readdirSync(this.projectsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    let resetCount = 0;

    for (const projDir of projDirs) {
      const tasksDir = path.join(this.projectsDir, projDir.name, "tasks");
      if (!fs.existsSync(tasksDir)) continue;

      const files = fs.readdirSync(tasksDir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        const filePath = path.join(tasksDir, file);
        let content = fs.readFileSync(filePath, "utf-8");
        if (content.includes("status: in-progress")) {
          content = content.replace(/status:\s*\S+/, "status: todo");
          content = content.replace(/started:\s*\S+/, "started: null");
          fs.writeFileSync(filePath, content);
          resetCount++;
        }
      }
    }

    if (resetCount > 0) {
      console.log(`[rue] Reset ${resetCount} orphaned in-progress task(s) to todo`);
    }
  }

  // ── Task Watcher — auto-spawn agents on new tasks ──────────────

  private _taskWatcher: NodeJS.Timeout | null = null;

  private activeProjectAgents = new Set<string>(); // track running agents by "project:taskFile"

  private startTaskWatcher(): void {
    // Scan all projects for todo tasks every 10 seconds
    this._taskWatcher = setInterval(() => {
      this.scanForTodoTasks();
    }, 10_000);

    // Also run once on startup after a short delay
    setTimeout(() => this.scanForTodoTasks(), 3000);
  }

  private scanForTodoTasks(): void {
    if (!fs.existsSync(this.projectsDir)) return;

    const projectDirs = fs.readdirSync(this.projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const projDir of projectDirs) {
      const configPath = path.join(this.projectsDir, projDir.name, "config.json");
      if (!fs.existsSync(configPath)) continue;

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (config.status !== "active") continue;

      const tasksDir = path.join(this.projectsDir, projDir.name, "tasks");
      if (!fs.existsSync(tasksDir)) continue;

      // Count in-progress tasks for this project
      const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith(".md"));
      let inProgressCount = 0;
      let nextTodo: { file: string; title: string } | null = null;

      for (const file of taskFiles) {
        const content = fs.readFileSync(path.join(tasksDir, file), "utf-8");
        if (content.includes("status: in-progress")) {
          inProgressCount++;
        } else if (content.includes("status: todo") && !nextTodo) {
          // Extract title
          const titleMatch = content.match(/^#\s+(.+)$/m);
          nextTodo = { file, title: titleMatch?.[1] ?? file };
        }
      }

      // Respect maxAgents limit
      const maxAgents = config.maxAgents ?? 1;
      if (inProgressCount >= maxAgents) continue;
      if (!nextTodo) continue;

      // Don't spawn if already running
      const key = `${projDir.name}:${nextTodo.file}`;
      if (this.activeProjectAgents.has(key)) continue;
      this.activeProjectAgents.add(key);

      console.log(`[rue] Picking up task "${nextTodo.title}" for project ${projDir.name}`);

      const taskPath = `tasks/${nextTodo.file}`;
      this.spawnProjectAgent(projDir.name, taskPath, nextTodo.title).finally(() => {
        this.activeProjectAgents.delete(key);
      });
    }
  }

  private async spawnProjectAgent(projectName: string, taskFile: string, taskDescription: string): Promise<void> {
    console.log(`[rue] Spawning agent for project "${projectName}" — ${taskDescription}`);
    const projectDir = path.join(this.projectsDir, projectName);
    const agentsMdPath = path.join(projectDir, "AGENTS.md");
    const taskFilePath = path.join(projectDir, taskFile);
    const workDir = path.join(projectDir, "work");

    // Build system prompt: base instructions + project-specific AGENTS.md
    let projectPrompt = "";
    if (fs.existsSync(agentsMdPath)) {
      projectPrompt = fs.readFileSync(agentsMdPath, "utf-8");
    }

    // Determine the actual work directory
    let cwd = workDir;
    if (fs.existsSync(workDir)) {
      const entries = fs.readdirSync(workDir);
      if (entries.length === 1) {
        const inner = path.join(workDir, entries[0]);
        if (fs.statSync(inner).isDirectory()) cwd = inner;
      }
    }

    const agentsPrompt = `# Project Agent — ${projectName}

You are an autonomous agent working on project "${projectName}".
You have been assigned a specific task. Complete it fully.

## How you work

1. You are running in: ${cwd}
2. This is your working directory — all code, files, and changes go here.
3. Do NOT modify files outside this directory.

## Documentation

The project has a docs/ folder at: ${path.join(projectDir, "docs")}
- While working, if you discover something important, create or update files in the project docs/ folder.
- Keep docs/notes.md updated with decisions, discoveries, and context for future agents.
- If your task is to write documentation, create the doc files in the repo's docs/ directory (inside the working directory).

## Task lifecycle

- Your task status has already been set to "in-progress" — just do the work.
- When you finish, summarize what you accomplished.
- If you get stuck, explain what went wrong so it can be retried.

## Quality

- Write clean, working code/docs.
- If working on code: run tests and type-check before finishing.
- If writing docs: make them clear, accurate, and useful.
- Commit your changes with descriptive messages.

${projectPrompt ? "## Project-Specific Instructions\n\n" + projectPrompt : ""}`;

    // Read the full task file for context
    let taskContent = taskDescription;
    if (fs.existsSync(taskFilePath)) {
      taskContent = fs.readFileSync(taskFilePath, "utf-8");
    }

    // Update task status to in-progress
    if (fs.existsSync(taskFilePath)) {
      let content = fs.readFileSync(taskFilePath, "utf-8");
      content = content.replace(/status:\s*\S+/, "status: in-progress");
      content = content.replace(/started:\s*\S+/, `started: ${new Date().toISOString()}`);
      fs.writeFileSync(taskFilePath, content);
    }

    const agentId = `project-${projectName}-${Date.now()}`;

    // Log agent start
    const logActivity = async (status: string, content: string) => {
      try {
        const { logAgentActivity } = await import(/* @vite-ignore */ "../../lib/db/helpers" + ".js");
        logAgentActivity(agentId, status, content, { projectName, taskTitle: taskDescription });
      } catch { /* db not available yet */ }
    };

    // Emit agent spawned event
    this.bus.emit("agent:spawned", { id: agentId, task: taskDescription, lane: "sub" });
    await logActivity("started", `Working on: ${taskDescription}`);

    // Spawn the agent via Claude SDK
    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      const prompt = `You have been assigned this task:\n\n${taskContent}\n\nComplete it now. When done, confirm what you accomplished.`;

      const q = query({
        prompt,
        options: {
          cwd,
          systemPrompt: agentsPrompt,
          tools: [
            "Read", "Write", "Edit", "Bash", "Glob", "Grep",
            "WebSearch", "WebFetch", "Agent",
          ],
          allowedTools: [
            "Read", "Write", "Edit", "Bash", "Glob", "Grep",
            "WebSearch", "WebFetch", "Agent",
          ],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 30,
          settingSources: [],
        },
      });

      let output = "";
      let lastLoggedOutput = "";
      for await (const message of q) {
        if (message.type === "assistant") {
          const content = (message as { message: { content: Array<{ type: string; text?: string }> } }).message.content;
          for (const block of content) {
            if (block.type === "text" && block.text) output += block.text;
          }
          // Log periodic output updates (every new assistant message)
          if (output !== lastLoggedOutput) {
            await logActivity("output", output.slice(-500));
            lastLoggedOutput = output;
          }
        }
        if (message.type === "result") {
          const resultMsg = message as { subtype: string; result?: string };
          if (resultMsg.subtype === "success" && resultMsg.result) {
            output = resultMsg.result;
          }
        }
      }

      // Update task to done
      if (fs.existsSync(taskFilePath)) {
        let content = fs.readFileSync(taskFilePath, "utf-8");
        content = content.replace(/status:\s*\S+/, "status: done");
        content = content.replace(/completed:\s*\S+/, `completed: ${new Date().toISOString()}`);
        fs.writeFileSync(taskFilePath, content);
      }

      this.bus.emit("agent:completed", { id: agentId, result: output.slice(0, 200), cost: 0 });
      await logActivity("completed", output.slice(0, 1000));

      // Persist result as a push message
      this.messages.append({
        role: "push",
        content: `[Project: ${projectName}] Task completed: ${taskDescription}\n\n${output.slice(0, 500)}`,
        metadata: { project: projectName, taskFile },
      });

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Mark task as failed
      if (fs.existsSync(taskFilePath)) {
        let content = fs.readFileSync(taskFilePath, "utf-8");
        content = content.replace(/status:\s*\S+/, "status: failed");
        fs.writeFileSync(taskFilePath, content);
      }

      this.bus.emit("agent:failed", { id: `project-${projectName}`, error: errMsg, retryable: false });
      await logActivity("failed", errMsg);
    }
  }
}
