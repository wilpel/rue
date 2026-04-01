import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { Injectable, Inject, OnModuleDestroy } from "@nestjs/common";
import type { WebSocket, WebSocketServer as WSServer } from "ws";
import { parseClientFrame, serializeDaemonFrame } from "./protocol.js";
import type { DaemonFrame } from "./protocol.js";
import { BusService } from "../bus/bus.service.js";
import { SupervisorService } from "../agents/supervisor.service.js";
import { ClaudeProcessService } from "../agents/claude-process.service.js";
import { AssemblerService } from "../memory/assembler.service.js";
import { MessageRepository } from "../memory/message.repository.js";
import { ConfigService } from "../config/config.service.js";
import { log } from "../shared/logger.js";

const sessionMap = new WeakMap<WebSocket, string>();
let lastSessionId: string | undefined;
let lastSessionTime = 0;

const activeAbortControllers = new WeakMap<WebSocket, Set<AbortController>>();
const wsUnsubscribers = new WeakMap<WebSocket, Array<() => void>>();

@Injectable()
@WebSocketGateway()
export class DaemonGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server!: WSServer;

  private static readonly QUERY_TIMEOUT_MS = 300_000;
  private readonly models: { primary: string; fallback: string[] };

  constructor(
    @Inject(BusService) private readonly bus: BusService,
    @Inject(SupervisorService) private readonly supervisor: SupervisorService,
    @Inject(ClaudeProcessService) private readonly processService: ClaudeProcessService,
    @Inject(AssemblerService) private readonly assembler: AssemblerService,
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.models = config.models;
  }

  handleConnection(_client: WebSocket): void {
    log.info("[gateway] Client connected");
  }

  handleDisconnect(client: WebSocket): void {
    const controllers = activeAbortControllers.get(client);
    if (controllers) { for (const ac of controllers) ac.abort(); controllers.clear(); }
    const unsubs = wsUnsubscribers.get(client);
    if (unsubs) { for (const unsub of unsubs) unsub(); unsubs.length = 0; }
    log.info("[gateway] Client disconnected");
  }

  onModuleDestroy(): void {
    if (this.server) {
      for (const client of this.server.clients) {
        this.handleDisconnect(client as WebSocket);
        (client as WebSocket).close();
      }
    }
  }

  afterInit(): void {
    this.server.on("connection", (ws: WebSocket) => {
      let messageCount = 0;
      let lastReset = Date.now();

      // Auto-forward delegate results as notify frames so TUI can show them
      const unsub = this.bus.on("delegate:result" as any, (payload: { agentId: string; output: string; chatId: string | number }) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(serializeDaemonFrame({ type: "notify", severity: "info", title: "Delegate result", body: payload.output }));
          this.messages.append({ role: "assistant", content: payload.output });
        }
      });
      let unsubs = wsUnsubscribers.get(ws);
      if (!unsubs) { unsubs = []; wsUnsubscribers.set(ws, unsubs); }
      unsubs.push(unsub);

      ws.on("message", async (data: Buffer) => {
        const now = Date.now();
        if (now - lastReset > 60_000) { messageCount = 0; lastReset = now; }
        messageCount++;
        if (messageCount > 30) {
          ws.send(serializeDaemonFrame({ type: "error", id: "ratelimit", code: "RATE_LIMIT", message: "Too many requests." }));
          return;
        }

        try {
          const frame = parseClientFrame(data.toString());
          await this.handleFrame(frame, ws);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ws.send(serializeDaemonFrame({ type: "error", id: "unknown", code: "PARSE_ERROR", message }));
        }
      });

      ws.on("close", () => this.handleDisconnect(ws));
      ws.on("error", () => this.handleDisconnect(ws));
    });
  }

  private async handleFrame(frame: ReturnType<typeof parseClientFrame>, ws: WebSocket): Promise<void> {
    const send = (f: DaemonFrame) => { if (ws.readyState === ws.OPEN) ws.send(serializeDaemonFrame(f)); };

    switch (frame.type) {
      case "cmd": await this.handleCmd(frame, ws, send); break;
      case "steer": this.supervisor.steer(frame.agentId, frame.message); break;
      case "kill": this.supervisor.kill(frame.agentId, "user requested"); break;
      case "subscribe": this.handleSubscribe(frame, ws); break;
    }
  }

  private async handleCmd(
    frame: { type: "cmd"; id: string; cmd: string; args: Record<string, unknown> },
    ws: WebSocket,
    send: (f: DaemonFrame) => void,
  ): Promise<void> {
    send({ type: "ack", id: frame.id });

    switch (frame.cmd) {
      case "ask": {
        const text = frame.args.text as string;
        log.info(`[gateway] ask: "${text.slice(0, 60)}"`);
        const systemPrompt = this.assembler.assemble(text);

        this.messages.append({ role: "user", content: text });

        // Emit agent event so sidebar sees activity
        const agentId = `gateway-${Date.now()}`;
        this.bus.emit("agent:spawned", { id: agentId, task: "Main agent", lane: "main" });

        try {
          const existingSession = sessionMap.get(ws) ?? (Date.now() - lastSessionTime < 1800_000 ? lastSessionId : undefined);

          const proc = this.processService.createProcess({
            id: agentId,
            task: text,
            lane: "main",
            workdir: process.cwd(),
            systemPrompt,
            timeout: DaemonGateway.QUERY_TIMEOUT_MS,
            maxTurns: 3,
            model: this.models.primary,
            allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
            resume: existingSession,
          });

          const abortCtrl = proc.abort;
          if (abortCtrl) this.trackAbort(ws, abortCtrl);

          proc.onOutput((chunk) => {
            send({ type: "stream", agentId: "main", chunk });
          });

          const result = await proc.run();

          if (abortCtrl) this.untrackAbort(ws, abortCtrl);

          if (result.sessionId) {
            sessionMap.set(ws, result.sessionId);
            lastSessionId = result.sessionId;
            lastSessionTime = Date.now();
          }

          const cleanedText = result.output.replace(/\[no_?response\]/gi, "").trim();
          if (cleanedText) {
            this.messages.append({ role: "assistant", content: cleanedText });
          }

          this.bus.emit("agent:completed", { id: agentId, result: cleanedText.slice(0, 100), cost: result.cost });
          send({ type: "result", id: frame.id, data: { output: cleanedText, cost: result.cost } });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`[gateway] SDK error: ${message}`);
          this.bus.emit("agent:failed", { id: agentId, error: message, retryable: false });
          send({ type: "error", id: frame.id, code: "SDK_ERROR", message });
        }
        break;
      }

      case "reset":
        sessionMap.delete(ws);
        lastSessionId = undefined;
        send({ type: "result", id: frame.id, data: { ok: true } });
        break;

      case "history": {
        const limit = (frame.args.limit as number) ?? 20;
        const msgs = this.messages.recent(limit);
        send({ type: "result", id: frame.id, data: { messages: msgs } });
        break;
      }

      case "status": {
        const agents = this.supervisor.listAgents();
        send({ type: "result", id: frame.id, data: { agents: agents.map(a => ({ id: a.id, task: a.config.task, state: a.state, lane: a.config.lane, cost: a.cost })) } });
        break;
      }

      case "agents":
        send({ type: "result", id: frame.id, data: { agents: this.supervisor.listAgents() } });
        break;

      default:
        send({ type: "error", id: frame.id, code: "UNKNOWN_CMD", message: `Unknown command: ${frame.cmd}` });
    }
  }

  private handleSubscribe(frame: { channels: string[] }, ws: WebSocket): void {
    let unsubs = wsUnsubscribers.get(ws);
    if (!unsubs) { unsubs = []; wsUnsubscribers.set(ws, unsubs); }
    for (const channel of frame.channels) {
      if (channel.endsWith("*")) {
        const unsub = this.bus.onWildcard(channel, (ch, payload) => {
          if (ws.readyState === ws.OPEN) ws.send(serializeDaemonFrame({ type: "event", channel: ch, payload }));
        });
        unsubs.push(unsub);
      }
    }
  }

  private trackAbort(ws: WebSocket, ac: AbortController): void {
    let set = activeAbortControllers.get(ws);
    if (!set) { set = new Set(); activeAbortControllers.set(ws, set); }
    set.add(ac);
  }

  private untrackAbort(ws: WebSocket, ac: AbortController): void {
    activeAbortControllers.get(ws)?.delete(ac);
  }
}
