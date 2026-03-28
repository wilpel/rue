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

    // Watch for task-added events and auto-spawn agents
    this.startTaskWatcher();

    this.bus.emit("system:started", {});
    await new Promise<void>((resolve) => {
      this.httpServer!.listen(this.config.port, resolve);
    });
  }

  async stop(): Promise<void> {
    this.bus.emit("system:shutdown", { reason: "shutdown requested" });
    if (this._taskWatcher) clearInterval(this._taskWatcher);
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

  // ── Task Watcher — auto-spawn agents on new tasks ──────────────

  private _taskWatcher: NodeJS.Timeout | null = null;
  private lastEventTimestamp = 0;

  private startTaskWatcher(): void {
    const eventsDir = path.join(os.homedir(), ".rue", "workspace", "events");
    const eventFile = path.join(eventsDir, "task-added.json");

    this._taskWatcher = setInterval(() => {
      if (!fs.existsSync(eventFile)) return;

      try {
        const raw = fs.readFileSync(eventFile, "utf-8");
        const event = JSON.parse(raw) as {
          type: string;
          project: string;
          taskFile: string;      // bare filename like "002-foo.md"
          taskTitle: string;
          taskId: number;
          timestamp: string;     // ISO string
        };

        // Only process new events
        const ts = new Date(event.timestamp).getTime();
        if (ts <= this.lastEventTimestamp) return;
        this.lastEventTimestamp = ts;

        console.log(`[rue] Task watcher: picked up task #${event.taskId} "${event.taskTitle}" for project ${event.project}`);

        // taskFile is bare filename — prepend tasks/
        const taskPath = `tasks/${event.taskFile}`;
        this.spawnProjectAgent(event.project, taskPath, event.taskTitle);
      } catch (err) {
        // Log errors instead of silently swallowing
        console.error("[rue] Task watcher error:", err instanceof Error ? err.message : err);
      }
    }, 5000); // Check every 5 seconds
  }

  private async spawnProjectAgent(projectName: string, taskFile: string, taskDescription: string): Promise<void> {
    console.log(`[rue] Spawning agent for project "${projectName}" — ${taskDescription}`);
    const projectDir = path.join(this.projectsDir, projectName);
    const agentsMdPath = path.join(projectDir, "AGENTS.md");
    const taskFilePath = path.join(projectDir, taskFile);
    const workDir = path.join(projectDir, "work");

    // Read AGENTS.md for system prompt
    let agentsPrompt = "You are a project agent. Complete the assigned task.";
    if (fs.existsSync(agentsMdPath)) {
      agentsPrompt = fs.readFileSync(agentsMdPath, "utf-8");
    }

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

    // Determine the actual work directory
    let cwd = workDir;
    if (fs.existsSync(workDir)) {
      const entries = fs.readdirSync(workDir);
      if (entries.length === 1) {
        // Single dir inside work/ — use it as cwd
        const inner = path.join(workDir, entries[0]);
        if (fs.statSync(inner).isDirectory()) cwd = inner;
      }
    }

    // Emit agent spawned event
    this.bus.emit("agent:spawned", {
      id: `project-${projectName}-${Date.now()}`,
      task: taskDescription,
      lane: "sub",
    });

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
      for await (const message of q) {
        if (message.type === "assistant") {
          const content = (message as { message: { content: Array<{ type: string; text?: string }> } }).message.content;
          for (const block of content) {
            if (block.type === "text" && block.text) output += block.text;
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

      this.bus.emit("agent:completed", {
        id: `project-${projectName}-${Date.now()}`,
        result: output.slice(0, 200),
        cost: 0,
      });

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

      this.bus.emit("agent:failed", {
        id: `project-${projectName}`,
        error: errMsg,
        retryable: false,
      });
    }
  }
}
