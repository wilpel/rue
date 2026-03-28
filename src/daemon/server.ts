import { WebSocketServer, type WebSocket } from "ws";
import { createServer, type Server as HttpServer } from "node:http";
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
    this.httpServer = createServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      });
      res.end("Rue daemon running");
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

    this.bus.emit("system:started", {});
    await new Promise<void>((resolve) => {
      this.httpServer!.listen(this.config.port, resolve);
    });
  }

  async stop(): Promise<void> {
    this.bus.emit("system:shutdown", { reason: "shutdown requested" });
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
}
