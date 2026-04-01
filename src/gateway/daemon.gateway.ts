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
import { SessionService } from "../memory/session.service.js";
import { DelegateService } from "../agents/delegate.service.js";
import { ConfigService } from "../config/config.service.js";
import { TaskService } from "../tasks/task.service.js";
import { log } from "../shared/logger.js";

const SESSION_KEY_GLOBAL = "gateway-global";

const activeAbortControllers = new WeakMap<WebSocket, Set<AbortController>>();
const wsUnsubscribers = new WeakMap<WebSocket, Array<() => void>>();
const wsSessionKeys = new WeakMap<WebSocket, string>();

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
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(DelegateService) private readonly delegate: DelegateService,
    @Inject(ConfigService) config: ConfigService,
    @Inject(TaskService) private readonly taskService: TaskService,
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

      // When a delegate finishes, re-trigger the main agent so it can respond via CLI
      // Only handle delegates spawned from gateway (chatId 0 or no chatId = CLI context)
      const unsub = this.bus.on("delegate:result", async (payload: { agentId: string; output: string; chatId: string | number }) => {
        if (ws.readyState !== ws.OPEN) return;
        // Skip if this delegate was for a non-CLI chat (channel.service handles Telegram etc)
        const cid = String(payload.chatId);
        if (cid && !cid.startsWith("cli-") && cid !== "0" && cid !== "undefined") return;

        // Store the delegate result in message history
        this.messages.append({ role: "channel", content: payload.output, metadata: { tag: `AGENT_DELEGATE_${payload.agentId}` } });

        // Re-run the main agent with the delegate result as context
        const recentMessages = this.messages.recent(20);
        const history = recentMessages.map(m => {
          const tag = (m.metadata as Record<string, unknown>)?.tag ?? (m.role === "assistant" ? "AGENT_RUE" : "USER");
          return `[${tag}] ${m.content}`;
        }).join("\n");

        const systemPrompt = this.assembler.assemble("");
        const prompt = `A background delegate agent just completed and posted its result to your conversation.\n\nHere is the recent conversation:\n\n${history}\n\n---\nRespond to the user with the delegate's result. Summarize or format it as appropriate.`;

        const agentId = `gateway-followup-${Date.now()}`;
        this.bus.emit("agent:spawned", { id: agentId, task: "Main agent", lane: "main" });

        try {
          const proc = this.processService.createProcess({
            id: agentId,
            task: prompt,
            lane: "main",
            workdir: process.cwd(),
            systemPrompt,
            timeout: 60_000,
            maxTurns: 2,
            model: this.models.primary,
            allowedTools: ["Bash"],
          });

          proc.onOutput((chunk) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(serializeDaemonFrame({ type: "stream", agentId: "main", chunk }));
            }
          });

          const result = await proc.run();
          const cleaned = result.output.replace(/\[no_?response\]/gi, "").trim();
          if (cleaned) {
            this.messages.append({ role: "assistant", content: cleaned });
          }

          this.bus.emit("agent:completed", { id: agentId, result: cleaned.slice(0, 100), cost: result.cost, inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens });

          // Send as a notify so TUI creates a new message bubble
          if (ws.readyState === ws.OPEN) {
            ws.send(serializeDaemonFrame({ type: "notify", severity: "info", title: "Delegate result", body: cleaned }));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(`[gateway] Delegate follow-up failed: ${msg}`);
          this.bus.emit("agent:failed", { id: agentId, error: msg, retryable: false });
          // Fallback: show raw delegate output
          if (ws.readyState === ws.OPEN) {
            ws.send(serializeDaemonFrame({ type: "notify", severity: "info", title: "Delegate result", body: payload.output }));
          }
        }
      });
      let unsubs = wsUnsubscribers.get(ws);
      if (!unsubs) { unsubs = []; wsUnsubscribers.set(ws, unsubs); }
      unsubs.push(unsub);

      // When a delegate asks a question, run the main agent to answer it
      const unsubQuestion = this.bus.on("delegate:question", async (payload) => {
        if (ws.readyState !== ws.OPEN) return;
        const cid = String(payload.chatId);
        if (cid && !cid.startsWith("cli-") && cid !== "0" && cid !== "undefined") return;

        this.messages.append({ role: "channel", content: `[Question from delegate ${payload.agentId}]: ${payload.question}`, metadata: { tag: "DELEGATE_QUESTION" } });

        const recentMessages = this.messages.recent(20);
        const history = recentMessages.map(m => {
          const tag = (m.metadata as Record<string, unknown>)?.tag ?? (m.role === "assistant" ? "AGENT_RUE" : "USER");
          return `[${tag}] ${m.content}`;
        }).join("\n");

        const systemPrompt = this.assembler.assemble("");
        const prompt = `A background delegate agent (${payload.agentId}) has paused and is asking you a question:\n\n"${payload.question}"\n\nHere is the recent conversation for context:\n\n${history}\n\n---\nAnswer the delegate's question. Your response will be sent directly back to the delegate agent so it can continue its work. Be concise and direct.`;

        const followupId = `gateway-answer-${Date.now()}`;
        this.bus.emit("agent:spawned", { id: followupId, task: "Answering delegate question", lane: "main" });

        try {
          const proc = this.processService.createProcess({
            id: followupId,
            task: prompt,
            lane: "main",
            workdir: process.cwd(),
            systemPrompt,
            timeout: 60_000,
            maxTurns: 2,
            model: this.models.primary,
            allowedTools: ["Bash"],
          });

          proc.onOutput((chunk) => {
            if (ws.readyState === ws.OPEN) ws.send(serializeDaemonFrame({ type: "stream", agentId: "main", chunk }));
          });

          const result = await proc.run();
          const cleaned = result.output.replace(/\[no_?response\]/gi, "").trim();

          // Post answer back to the delegate
          this.delegate.postAnswer(payload.agentId, cleaned || "No answer available");

          if (cleaned) {
            this.messages.append({ role: "assistant", content: cleaned });
            if (ws.readyState === ws.OPEN) ws.send(serializeDaemonFrame({ type: "notify", severity: "info", title: "Delegate answer", body: cleaned }));
          }

          this.bus.emit("agent:completed", { id: followupId, result: cleaned.slice(0, 100), cost: result.cost, inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.delegate.postAnswer(payload.agentId, `Error: ${msg}`);
          this.bus.emit("agent:failed", { id: followupId, error: msg, retryable: false });
        }
      });
      unsubs.push(unsubQuestion);

      // When a scheduled task fires, re-trigger the main agent with the event
      const unsubSchedule = this.bus.on("task:updated", async (payload) => {
        if (ws.readyState !== ws.OPEN) return;
        if (payload.status !== "triggered") return;

        const recentMessages = this.messages.recent(20);
        const history = recentMessages.map(m => {
          const tag = (m.metadata as Record<string, unknown>)?.tag ?? (m.role === "assistant" ? "AGENT_RUE" : "USER");
          return `[${tag}] ${m.content}`;
        }).join("\n");

        const systemPrompt = this.assembler.assemble("");
        const prompt = `A scheduled event just triggered. Here is the recent conversation including the event:\n\n${history}\n\n---\nRespond to the scheduled event. If it requires action, delegate it. If it's a reminder, inform the user.`;

        const agentId = `gateway-schedule-${Date.now()}`;
        this.bus.emit("agent:spawned", { id: agentId, task: "Main agent", lane: "main" });

        try {
          const proc = this.processService.createProcess({
            id: agentId,
            task: prompt,
            lane: "main",
            workdir: process.cwd(),
            systemPrompt,
            timeout: 60_000,
            maxTurns: 4,
            model: this.models.primary,
            allowedTools: ["Bash"],
          });

          proc.onOutput((chunk) => {
            if (ws.readyState === ws.OPEN) ws.send(serializeDaemonFrame({ type: "stream", agentId: "main", chunk }));
          });

          const result = await proc.run();
          const cleaned = result.output.replace(/\[no_?response\]/gi, "").trim();

          if (cleaned) {
            this.messages.append({ role: "assistant", content: cleaned });
            if (ws.readyState === ws.OPEN) ws.send(serializeDaemonFrame({ type: "notify", severity: "info", title: "Scheduled event", body: cleaned }));
          }

          this.bus.emit("agent:completed", { id: agentId, result: cleaned.slice(0, 100), cost: result.cost, inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(`[gateway] Schedule handler failed: ${msg}`);
          this.bus.emit("agent:failed", { id: agentId, error: msg, retryable: false });
        }
      });
      unsubs.push(unsubSchedule);

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
          const wsKey = wsSessionKeys.get(ws);
          const existingSession = (wsKey ? this.sessions.get(wsKey) : undefined) ?? this.sessions.get(SESSION_KEY_GLOBAL);

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
            const key = `gateway-ws-${Date.now()}`;
            wsSessionKeys.set(ws, key);
            this.sessions.set(key, result.sessionId);
            this.sessions.set(SESSION_KEY_GLOBAL, result.sessionId);
          }

          const cleanedText = result.output.replace(/\[no_?response\]/gi, "").trim();
          if (cleanedText) {
            this.messages.append({ role: "assistant", content: cleanedText });
          }

          this.bus.emit("agent:completed", { id: agentId, result: cleanedText.slice(0, 100), cost: result.cost, inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens });
          send({ type: "result", id: frame.id, data: { output: cleanedText, cost: result.cost } });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`[gateway] SDK error: ${message}`);
          this.bus.emit("agent:failed", { id: agentId, error: message, retryable: false });
          send({ type: "error", id: frame.id, code: "SDK_ERROR", message });
        }
        break;
      }

      case "reset": {
        const resetKey = wsSessionKeys.get(ws);
        if (resetKey) this.sessions.clear(resetKey);
        this.sessions.clear(SESSION_KEY_GLOBAL);
        send({ type: "result", id: frame.id, data: { ok: true } });
        break;
      }

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

      case "tasks": {
        const active = this.taskService.listActive();
        send({ type: "result", id: frame.id, data: { tasks: active } });
        break;
      }

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
