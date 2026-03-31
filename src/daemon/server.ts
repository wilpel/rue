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
import { createHandler, cleanupWebSocket } from "./handler.js";
import { parseClientFrame, serializeDaemonFrame } from "./protocol.js";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { TelegramBot } from "../interfaces/telegram/bot.js";
import { TelegramStore } from "../interfaces/telegram/store.js";
import { JobScheduler } from "./scheduler.js";
import { HealthMonitor } from "../agents/health.js";
import { log } from "../shared/logger.js";
import type { SDKAssistantMessage, SDKResultMessage } from "../shared/sdk-types.js";

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
  private healthMonitor: HealthMonitor;

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
    this.healthMonitor = new HealthMonitor(this.bus, { stallThresholdMs: 120_000, checkIntervalMs: 30_000 });
  }

  async start(): Promise<void> {
    // The Claude SDK adds process exit listeners per query() call.
    // Raise the limit to avoid spurious warnings during concurrent agent work.
    process.setMaxListeners(50);

    // Restore working memory from previous session snapshot
    const snapshotPath = path.join(this.config.dataDir, "working-memory.json");
    if (fs.existsSync(snapshotPath)) {
      this.working.fromSnapshot(fs.readFileSync(snapshotPath, "utf-8"));
    }

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
      identity: this.identity,
      userModel: this.userModel,
      semanticMemory: this.semantic,
    });

    this.wss.on("connection", (ws: WebSocket) => {
      let messageCount = 0;
      let lastReset = Date.now();

      // Clean up all resources (abort controllers, bus listeners) when WS closes
      ws.on("close", () => cleanupWebSocket(ws));
      ws.on("error", () => cleanupWebSocket(ws));

      ws.on("message", async (data) => {
        // Rate limit: max 30 messages per minute per connection
        const now = Date.now();
        if (now - lastReset > 60_000) { messageCount = 0; lastReset = now; }
        messageCount++;
        if (messageCount > 30) {
          ws.send(serializeDaemonFrame({ type: "error", id: "ratelimit", code: "RATE_LIMIT", message: "Too many requests. Slow down." }));
          return;
        }

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

    // Start health monitor to detect stalled agents
    this.healthMonitor.start();

    this.bus.emit("system:started", {});
    log.info("[rue] Bus + scheduler started");

    // Log memory usage every 5 minutes for leak detection
    this._memoryLogger = setInterval(() => {
      const mem = process.memoryUsage();
      log.info("[rue] Memory", { rss: Math.round(mem.rss / 1024 / 1024) + "MB", heap: Math.round(mem.heapUsed / 1024 / 1024) + "MB" });
    }, 300_000);

    // Sync identity from MEMORY.md if available
    try {
      const memPath = path.join(os.homedir(), ".rue", "memory", "MEMORY.md");
      if (fs.existsSync(memPath)) {
        const mem = fs.readFileSync(memPath, "utf-8");
        const nameMatch = mem.match(/User's name is (\w+)/i) || mem.match(/name:\s*(\w+)/i);
        if (nameMatch && !this.identity.getState().name) {
          this.identity.update({ name: nameMatch[1] });
          this.identity.save();
        }
      }
    } catch {}

    // Sync user model from MEMORY.md if available
    try {
      const memPath = path.join(os.homedir(), ".rue", "memory", "MEMORY.md");
      if (fs.existsSync(memPath)) {
        const mem = fs.readFileSync(memPath, "utf-8");
        const nameMatch = mem.match(/User's name is (\w+)/i);
        if (nameMatch && !this.userModel.getProfile().name) {
          this.userModel.update({ name: nameMatch[1] });
          this.userModel.save();
        }
      }
    } catch {}

    // Start Telegram bot if configured (non-blocking)
    this.startTelegramBot().catch(err => log.error("[rue] Telegram start failed", { error: err }));
    await new Promise<void>((resolve) => {
      this.httpServer!.listen(this.config.port, "127.0.0.1", resolve);
    });
  }

  async stop(): Promise<void> {
    this.bus.emit("system:shutdown", { reason: "shutdown requested" });

    // Save all memory state on shutdown
    try {
      const snapshotPath = path.join(this.config.dataDir, "working-memory.json");
      fs.writeFileSync(snapshotPath, this.working.toSnapshot());
      this.identity.save();
      this.userModel.save();
    } catch {}

    if (this._taskWatcher) clearInterval(this._taskWatcher);
    if (this._memoryLogger) clearInterval(this._memoryLogger);
    this.healthMonitor.stop();
    this.scheduler.stop();
    if (this.telegramBot) await this.telegramBot.stop();
    this.supervisor.shutdown();
    // Abort all running project agents
    for (const ac of this.activeProjectAbortControllers) ac.abort();
    this.activeProjectAbortControllers.clear();
    // Clear all event bus listeners to prevent leaked references
    this.bus.removeAllListeners();
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
      log.info("[telegram] No bot token configured — skipping Telegram integration");
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
      log.info("[telegram] Bot connected and listening");
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

      // POST /api/projects
      if (pathname === "/api/projects" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const { name, description, maxAgents } = JSON.parse(body);
            if (!name) { json({ error: "name required" }, 400); return; }
            const { execSync } = require("node:child_process");
            const args = [`--name "${name.replace(/"/g, '\\"')}"`];
            if (description) args.push(`--description "${description.replace(/"/g, '\\"')}"`);
            if (maxAgents) args.push(`--max-agents ${maxAgents}`);
            execSync(`node --import tsx/esm skills/projects/run.ts create ${args.join(" ")}`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
            json({ ok: true });
          } catch (err) {
            json({ error: err instanceof Error ? err.message : "Failed to create project" }, 500);
          }
        });
        return;
      }

      // POST /api/projects/:name/tasks
      const addTaskMatch = pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
      if (addTaskMatch && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const { title, description } = JSON.parse(body);
            if (!title) { json({ error: "title required" }, 400); return; }
            const projectName = decodeURIComponent(addTaskMatch[1]);
            // Use the CLI skill to add the task
            const { execSync } = require("node:child_process");
            execSync(`node --import tsx/esm skills/projects/run.ts add-task --project "${projectName}" --task "${title.replace(/"/g, '\\"')}"${description ? ` --description "${description.replace(/"/g, '\\"')}"` : ""}`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
            json({ ok: true });
          } catch (err) {
            json({ error: err instanceof Error ? err.message : "Failed to add task" }, 500);
          }
        });
        return;
      }

      // GET /api/secrets — list secret keys (no values)
      if (pathname === "/api/secrets" && req.method === "GET") {
        try {
          const { execSync } = require("node:child_process");
          const output = execSync("node --import tsx/esm skills/secrets/run.ts list", { cwd: PROJECT_ROOT, encoding: "utf-8" });
          // Parse the output to extract keys
          const keys = output.split("\n").filter((l: string) => l.trim().startsWith("  ")).map((l: string) => l.trim());
          json({ keys });
        } catch { json({ keys: [] }); }
        return;
      }

      // POST /api/secrets — set a secret
      if (pathname === "/api/secrets" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const { key, value } = JSON.parse(body);
            if (!key || !value) { json({ error: "key and value required" }, 400); return; }
            const { execSync } = require("node:child_process");
            execSync(`node --import tsx/esm skills/secrets/run.ts set --key "${key.replace(/"/g, '\\"')}" --value "${value.replace(/"/g, '\\"')}"`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
            json({ ok: true });
          } catch (err) {
            json({ error: err instanceof Error ? err.message : "Failed" }, 500);
          }
        });
        return;
      }

      // DELETE /api/secrets/:key
      const deleteSecretMatch = pathname.match(/^\/api\/secrets\/([^/]+)$/);
      if (deleteSecretMatch && req.method === "DELETE") {
        try {
          const key = decodeURIComponent(deleteSecretMatch[1]);
          const { execSync } = require("node:child_process");
          execSync(`node --import tsx/esm skills/secrets/run.ts delete --key "${key}"`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
          json({ ok: true });
        } catch { json({ error: "Failed to delete" }, 500); }
        return;
      }

      // GET /api/delegates — list all delegate agents and their status
      if (pathname === "/api/delegates" && req.method === "GET") {
        const agents = Array.from(this.delegateAgents.entries()).map(([id, info]) => ({
          id,
          task: info.task,
          status: info.status,
          startedAt: info.startedAt,
          runningFor: info.status === "running" ? Math.round((Date.now() - info.startedAt) / 1000) + "s" : undefined,
          result: info.result?.slice(0, 200),
          activity: info.activity,
        }));
        json({ agents });
        return;
      }

      // GET /api/delegates/:id — get a specific delegate agent
      const delegateMatch = pathname.match(/^\/api\/delegates\/([^/]+)$/);
      if (delegateMatch && req.method === "GET") {
        const id = decodeURIComponent(delegateMatch[1]);
        const info = this.delegateAgents.get(id);
        if (!info) { json({ error: "Agent not found" }, 404); return; }
        json({ id, task: info.task, status: info.status, startedAt: info.startedAt, runningFor: info.status === "running" ? Math.round((Date.now() - info.startedAt) / 1000) + "s" : undefined, result: info.result, activity: info.activity });
        return;
      }

      // POST /api/delegate — spawn background agent, send result via Telegram
      if (pathname === "/api/delegate" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const { task, chatId, messageId } = JSON.parse(body);
            if (!task || !chatId) { json({ error: "task and chatId required" }, 400); return; }
            const agentId = `delegate-${Date.now()}`;
            this.delegateAgents.set(agentId, { task, status: "running", startedAt: Date.now(), activity: [] });
            this.spawnDelegatedTask(agentId, task, chatId, messageId)
              .catch(err => log.error(`[delegate] Agent ${agentId} failed`, { error: err instanceof Error ? err.message : err }));
            json({ ok: true, agentId });
          } catch (err) {
            json({ error: err instanceof Error ? err.message : "Failed" }, 500);
          }
        });
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
          const tmpPath = filePath + ".tmp";
          fs.writeFileSync(tmpPath, content);
          fs.renameSync(tmpPath, filePath);
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
  private _memoryLogger: NodeJS.Timeout | null = null;

  private activeProjectAgents = new Set<string>(); // track running agents by "project:taskFile"
  private delegateAgents = new Map<string, { task: string; status: string; startedAt: number; result?: string; activity: string[] }>(); // track delegate agents
  private activeProjectAbortControllers = new Set<AbortController>(); // abort on shutdown
  private static readonly PROJECT_AGENT_TIMEOUT_MS = 600_000; // 10 min hard timeout

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

      log.info(`[rue] Picking up task "${nextTodo.title}" for project ${projDir.name}`);

      const taskPath = `tasks/${nextTodo.file}`;
      this.spawnProjectAgent(projDir.name, taskPath, nextTodo.title)
        .catch(err => console.error(`[rue] Agent spawn failed for ${projDir.name}: ${err instanceof Error ? err.message : err}`))
        .finally(() => { this.activeProjectAgents.delete(key); });
    }
  }

  private async spawnProjectAgent(projectName: string, taskFile: string, taskDescription: string): Promise<void> {
    log.info(`[rue] Spawning agent for project "${projectName}" — ${taskDescription}`);
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
      const tmpPath = taskFilePath + ".tmp";
      fs.writeFileSync(tmpPath, content);
      fs.renameSync(tmpPath, taskFilePath);
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
    this.healthMonitor.trackAgent(agentId, Date.now());
    await logActivity("started", `Working on: ${taskDescription}`);

    // Spawn the agent via Claude SDK
    const abortController = new AbortController();
    this.activeProjectAbortControllers.add(abortController);

    // Hard timeout: abort project agent if it runs too long
    const timeoutTimer = setTimeout(() => {
      if (!abortController.signal.aborted) {
        log.warn(`[rue] Project agent "${projectName}" timed out after ${DaemonServer.PROJECT_AGENT_TIMEOUT_MS / 1000}s — aborting`);
        abortController.abort();
      }
    }, DaemonServer.PROJECT_AGENT_TIMEOUT_MS);

    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      const prompt = `You have been assigned this task:\n\n${taskContent}\n\nComplete it now. When done, confirm what you accomplished.`;

      const q = query({
        prompt,
        options: {
          cwd,
          systemPrompt: agentsPrompt,
          model: "opus",  // Use opus with standard 200k context
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
          abortController,
          settingSources: [],
        },
      });

      let output = "";
      let lastLoggedOutput = "";
      for await (const message of q) {
        if (message.type === "assistant") {
          const assistantMsg = message as SDKAssistantMessage;
          const content = assistantMsg.message.content;
          for (const block of content) {
            if (block.type === "text") output += (block as { type: "text"; text: string }).text;
          }
          // Log periodic output updates (every new assistant message)
          if (output !== lastLoggedOutput) {
            await logActivity("output", output.slice(-500));
            lastLoggedOutput = output;
          }
        }
        if (message.type === "result") {
          const resultMsg = message as SDKResultMessage;
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
        const tmpPath = taskFilePath + ".tmp";
        fs.writeFileSync(tmpPath, content);
        fs.renameSync(tmpPath, taskFilePath);
      }

      this.bus.emit("agent:completed", { id: agentId, result: output.slice(0, 200), cost: 0 });
      this.healthMonitor.untrackAgent(agentId);
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
        const tmpPath = taskFilePath + ".tmp";
        fs.writeFileSync(tmpPath, content);
        fs.renameSync(tmpPath, taskFilePath);
      }

      this.bus.emit("agent:failed", { id: `project-${projectName}`, error: errMsg, retryable: false });
      this.healthMonitor.untrackAgent(agentId);
      await logActivity("failed", errMsg);
    } finally {
      clearTimeout(timeoutTimer);
      this.activeProjectAbortControllers.delete(abortController);
    }
  }

  // ── Delegated Tasks — background agents that report results via Telegram ──

  private async spawnDelegatedTask(agentId: string, task: string, chatId: number, messageId?: number): Promise<void> {
    log.info(`[delegate] Spawning ${agentId}: "${task.slice(0, 60)}"`);

    const abortController = new AbortController();
    this.activeProjectAbortControllers.add(abortController);

    const timeoutTimer = setTimeout(() => {
      if (!abortController.signal.aborted) {
        log.warn(`[delegate] Agent ${agentId} timed out — aborting`);
        abortController.abort();
      }
    }, DaemonServer.PROJECT_AGENT_TIMEOUT_MS);

    this.bus.emit("agent:spawned", { id: agentId, task, lane: "sub" });
    this.healthMonitor.trackAgent(agentId, Date.now());

    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      const systemPrompt = `You are a background worker agent for Rue. You have been given a task to complete.
Do the work thoroughly using your available tools. When done, output ONLY the final answer/result that should be sent to the user — no meta-commentary about being an agent.
Be concise but complete. Format nicely for Telegram (plain text, no markdown headers).`;

      const q = query({
        prompt: task,
        options: {
          cwd: PROJECT_ROOT,
          systemPrompt,
          model: "sonnet",
          tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"],
          allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 25,
          abortController,
          settingSources: [],
        },
      });

      let output = "";
      const tracking = this.delegateAgents.get(agentId);
      for await (const message of q) {
        if (message.type === "assistant") {
          const assistantMsg = message as SDKAssistantMessage;
          for (const block of assistantMsg.message.content) {
            if (block.type === "text") {
              const text = (block as { type: "text"; text: string }).text;
              output += text;
              if (tracking && text.trim()) tracking.activity.push(`text: ${text.trim().slice(0, 100)}`);
            }
            if (block.type === "tool_use") {
              const tool = block as { type: "tool_use"; name: string; input?: Record<string, unknown> };
              const summary = tool.name === "Bash" ? `Bash: ${String(tool.input?.command ?? "").slice(0, 80)}`
                : tool.name === "WebSearch" ? `WebSearch: ${String(tool.input?.query ?? "").slice(0, 80)}`
                : tool.name === "WebFetch" ? `WebFetch: ${String(tool.input?.url ?? "").slice(0, 80)}`
                : tool.name === "Read" ? `Read: ${String(tool.input?.file_path ?? "").slice(0, 80)}`
                : `${tool.name}`;
              if (tracking) tracking.activity.push(summary);
            }
          }
        }
        if (message.type === "result") {
          const resultMsg = message as SDKResultMessage;
          if (resultMsg.subtype === "success" && resultMsg.result) {
            output = resultMsg.result;
          }
        }
      }

      // Send result back via Telegram
      if (output.trim()) {
        await this.sendTelegramResult(chatId, output.trim(), messageId);
        log.info(`[delegate] Agent ${agentId} completed, sent ${output.length} chars to chat ${chatId}`);
      }

      const prev = this.delegateAgents.get(agentId);
      this.delegateAgents.set(agentId, { task: prev?.task ?? "", status: "completed", startedAt: prev?.startedAt ?? Date.now(), result: output.slice(0, 1000), activity: prev?.activity ?? [] });
      this.bus.emit("agent:completed", { id: agentId, result: output.slice(0, 200), cost: 0 });
      this.healthMonitor.untrackAgent(agentId);

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`[delegate] Agent ${agentId} failed: ${errMsg}`);
      const prev = this.delegateAgents.get(agentId);
      this.delegateAgents.set(agentId, { task: prev?.task ?? "", status: "failed", startedAt: prev?.startedAt ?? Date.now(), result: errMsg, activity: prev?.activity ?? [] });
      await this.sendTelegramResult(chatId, "Sorry, I ran into an issue with that task. Try again?", messageId).catch(() => {});
      this.bus.emit("agent:failed", { id: agentId, error: errMsg, retryable: false });
      this.healthMonitor.untrackAgent(agentId);
    } finally {
      clearTimeout(timeoutTimer);
      this.activeProjectAbortControllers.delete(abortController);
      // Clean up old completed/failed entries after 10 minutes
      setTimeout(() => this.delegateAgents.delete(agentId), 600_000);
    }
  }

  /** Send a message via Telegram bot token directly (no daemon client needed). */
  private async sendTelegramResult(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
    const store = new TelegramStore(this.config.dataDir);
    const token = store.getBotToken();
    if (!token) { log.error("[delegate] No Telegram token — cannot send result"); return; }

    // Split long messages (Telegram max 4096 chars)
    const MAX_LEN = 4096;
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_LEN) { chunks.push(remaining); break; }
      let splitIdx = remaining.lastIndexOf("\n\n", MAX_LEN);
      if (splitIdx < MAX_LEN / 2) splitIdx = remaining.lastIndexOf("\n", MAX_LEN);
      if (splitIdx < MAX_LEN / 4) splitIdx = MAX_LEN;
      chunks.push(remaining.slice(0, splitIdx));
      remaining = remaining.slice(splitIdx).trim();
    }

    for (let i = 0; i < chunks.length; i++) {
      const body: Record<string, unknown> = { chat_id: chatId, text: chunks[i] };
      if (i === 0 && replyToMessageId) body.reply_to_message_id = replyToMessageId;
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        log.error(`[delegate] Telegram send failed: ${res.status} ${res.statusText}`);
      }
    }
  }
}
