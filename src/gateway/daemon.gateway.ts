import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { Injectable, Inject, OnModuleDestroy } from "@nestjs/common";
import type { WebSocket, WebSocketServer as WSServer } from "ws";
import { parseClientFrame, serializeDaemonFrame } from "./protocol.js";
import type { DaemonFrame } from "./protocol.js";
import { BusService } from "../bus/bus.service.js";
import { SupervisorService } from "../agents/supervisor.service.js";
import { AssemblerService } from "../memory/assembler.service.js";
import { MessageRepository } from "../memory/message.repository.js";
import { InboxService } from "../inbox/inbox.service.js";
import { log } from "../shared/logger.js";
import type { SDKSystemMessage, SDKStreamEvent, SDKAssistantMessage, SDKResultMessage } from "../shared/sdk-types.js";

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

  constructor(
    @Inject(BusService) private readonly bus: BusService,
    @Inject(SupervisorService) private readonly supervisor: SupervisorService,
    @Inject(AssemblerService) private readonly assembler: AssemblerService,
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(InboxService) private readonly inbox: InboxService,
  ) {}

  handleConnection(_client: WebSocket): void {
    log.info("[gateway] Client connected");
  }

  handleDisconnect(client: WebSocket): void {
    // Abort all active queries for this client
    const controllers = activeAbortControllers.get(client);
    if (controllers) { for (const ac of controllers) ac.abort(); controllers.clear(); }
    // Remove bus listeners
    const unsubs = wsUnsubscribers.get(client);
    if (unsubs) { for (const unsub of unsubs) unsub(); unsubs.length = 0; }
    log.info("[gateway] Client disconnected");
  }

  onModuleDestroy(): void {
    // Clean up all connections on shutdown
    if (this.server) {
      for (const client of this.server.clients) {
        this.handleDisconnect(client as WebSocket);
        (client as WebSocket).close();
      }
    }
  }

  // NestJS WS gateway calls handleConnection/handleDisconnect automatically.
  // For raw WS, we handle messages via the 'message' event in handleConnection.
  // Override handleConnection to set up the raw message handler:
  afterInit(): void {
    // The @WebSocketGateway sets up the WS server.
    // We need to handle raw messages since we use a custom frame protocol.
    this.server.on("connection", (ws: WebSocket) => {
      let messageCount = 0;
      let lastReset = Date.now();

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

        // Push to inbox
        this.inbox.push("websocket", text, {});

        try {
          const { query } = await import("@anthropic-ai/claude-agent-sdk");
          const abortController = new AbortController();
          this.trackAbort(ws, abortController);

          const timeoutTimer = setTimeout(() => { if (!abortController.signal.aborted) abortController.abort(); }, DaemonGateway.QUERY_TIMEOUT_MS);

          const existingSession = sessionMap.get(ws) ?? (Date.now() - lastSessionTime < 1800_000 ? lastSessionId : undefined);

          const q = query({
            prompt: text,
            options: {
              cwd: process.cwd(),
              systemPrompt,
              model: "opus",
              tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
              allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
              permissionMode: "bypassPermissions",
              allowDangerouslySkipPermissions: true,
              maxTurns: 3,
              abortController,
              includePartialMessages: true,
              settingSources: [],
              ...(existingSession ? { resume: existingSession } : {}),
            },
          });

          let allText = "";
          let cost = 0;
          let streamedInCurrentTurn = 0;

          for await (const message of q) {
            switch (message.type) {
              case "system": {
                const sysMsg = message as SDKSystemMessage;
                if (sysMsg.subtype === "init" && sysMsg.session_id) {
                  sessionMap.set(ws, sysMsg.session_id);
                  lastSessionId = sysMsg.session_id;
                  lastSessionTime = Date.now();
                }
                break;
              }
              case "stream_event": {
                const streamEvt = message as SDKStreamEvent;
                const event = streamEvt.event;
                if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
                  allText += event.delta.text;
                  streamedInCurrentTurn += event.delta.text.length;
                  send({ type: "stream", agentId: "main", chunk: event.delta.text });
                }
                break;
              }
              case "assistant": {
                const assistantMsg = message as SDKAssistantMessage;
                const fullText = assistantMsg.message.content.filter(b => b.type === "text").map(b => (b as { type: "text"; text: string }).text).join("");
                if (fullText && streamedInCurrentTurn === 0) {
                  allText += fullText;
                  send({ type: "stream", agentId: "main", chunk: fullText });
                }
                streamedInCurrentTurn = 0;
                break;
              }
              case "result": {
                const resultMsg = message as SDKResultMessage;
                cost = resultMsg.total_cost_usd;
                if (resultMsg.session_id) { sessionMap.set(ws, resultMsg.session_id); lastSessionId = resultMsg.session_id; lastSessionTime = Date.now(); }
                if (resultMsg.subtype === "success" && resultMsg.result && !allText) {
                  allText = resultMsg.result;
                  send({ type: "stream", agentId: "main", chunk: resultMsg.result });
                }
                break;
              }
            }
          }

          clearTimeout(timeoutTimer);
          this.untrackAbort(ws, abortController);

          const cleanedText = allText.replace(/\[no_?response\]/gi, "").trim();
          if (cleanedText) {
            this.messages.append({ role: "assistant", content: cleanedText });
          }
          send({ type: "result", id: frame.id, data: { output: cleanedText, cost } });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`[gateway] SDK error: ${message}`);
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
        const messages = this.messages.recent(limit);
        send({ type: "result", id: frame.id, data: { messages } });
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
