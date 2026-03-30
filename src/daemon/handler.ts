import type { EventBus } from "../bus/bus.js";
import type { AgentSupervisor } from "../agents/supervisor.js";
import type { Planner } from "../cortex/prefrontal/planner.js";
import type { ContextAssembler } from "../cortex/limbic/memory/assembler.js";
import type { MessageStore } from "../messages/store.js";
import type { IdentityCore } from "../cortex/limbic/identity/core.js";
import type { UserModel } from "../cortex/limbic/identity/user-model.js";
import type { SemanticMemory } from "../cortex/limbic/memory/semantic.js";
import type { ClientFrame, DaemonFrame } from "./protocol.js";
import type { WebSocket } from "ws";
import { serializeDaemonFrame } from "./protocol.js";
import { log } from "../shared/logger.js";
import type { SDKSystemMessage, SDKStreamEvent, SDKAssistantMessage, SDKUserMessage, SDKResultMessage } from "../shared/sdk-types.js";

export interface HandlerDeps {
  projectRoot: string;
  bus: EventBus;
  supervisor: AgentSupervisor;
  planner: Planner;
  assembler: ContextAssembler;
  messages: MessageStore;
  identity: IdentityCore;
  userModel: UserModel;
  semanticMemory: SemanticMemory;
}

// Track session per WebSocket connection for conversation continuity.
// Also keep a global "last session" so new WS connections can resume.
const sessionMap = new WeakMap<WebSocket, string>();
let lastSessionId: string | undefined;
let lastSessionTime = 0;

// Track active AbortControllers per WebSocket so we can abort on disconnect
const activeAbortControllers = new WeakMap<WebSocket, Set<AbortController>>();

// Track bus unsubscribe functions per WebSocket for cleanup on disconnect
const wsUnsubscribers = new WeakMap<WebSocket, Array<() => void>>();

function trackAbortController(ws: WebSocket, ac: AbortController): void {
  let set = activeAbortControllers.get(ws);
  if (!set) { set = new Set(); activeAbortControllers.set(ws, set); }
  set.add(ac);
}

function untrackAbortController(ws: WebSocket, ac: AbortController): void {
  activeAbortControllers.get(ws)?.delete(ac);
}

/** Abort all active queries and remove bus listeners for a disconnected WebSocket */
export function cleanupWebSocket(ws: WebSocket): void {
  const controllers = activeAbortControllers.get(ws);
  if (controllers) {
    for (const ac of controllers) ac.abort();
    controllers.clear();
  }
  const unsubs = wsUnsubscribers.get(ws);
  if (unsubs) {
    for (const unsub of unsubs) unsub();
    unsubs.length = 0;
  }
}

export function createHandler(deps: HandlerDeps) {
  return async (frame: ClientFrame, ws: WebSocket): Promise<void> => {
    switch (frame.type) {
      case "cmd":
        await handleCmd(frame, ws, deps);
        break;
      case "steer":
        deps.supervisor.steer(frame.agentId, frame.message);
        break;
      case "kill":
        deps.supervisor.kill(frame.agentId, "user requested");
        break;
      case "subscribe":
        handleSubscribe(frame, ws, deps.bus);
        break;
    }
  };
}

async function handleCmd(
  frame: Extract<ClientFrame, { type: "cmd" }>,
  ws: WebSocket,
  deps: HandlerDeps,
): Promise<void> {
  const send = (f: DaemonFrame) => ws.send(serializeDaemonFrame(f));
  send({ type: "ack", id: frame.id });

  try {
    switch (frame.cmd) {
      case "ask": {
        const text = frame.args.text as string;
        log.info(`[rue] ask: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`);
        const systemPrompt = deps.assembler.assemble(text);
        const workdir = (frame.args.workdir as string) ?? deps.projectRoot;
        const existingSessionId = sessionMap.get(ws) ?? (Date.now() - lastSessionTime < 1800_000 ? lastSessionId : undefined);

        // Persist user message
        deps.messages.append({ role: "user", content: text });
        deps.bus.emit("message:created", { id: "", role: "user", content: text, timestamp: Date.now() });

        // Try with session resume first, fall back to fresh session on failure
        const QUERY_TIMEOUT_MS = 300_000; // 5 min hard timeout per query

        const runQuery = async (resumeId: string | undefined) => {
          const { query } = await import("@anthropic-ai/claude-agent-sdk");

          const abortController = new AbortController();
          trackAbortController(ws, abortController);

          // Hard timeout: abort the query if it runs too long
          const timeoutTimer = setTimeout(() => {
            if (!abortController.signal.aborted) abortController.abort();
          }, QUERY_TIMEOUT_MS);

          const q = query({
            prompt: text,
            options: {
              cwd: workdir,
              systemPrompt,
              model: "opus",  // Use opus with standard 200k context (not 1M which has stricter rate limits)
              tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
              allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
              permissionMode: "bypassPermissions",
              allowDangerouslySkipPermissions: true,
              maxTurns: 3,  // Main agent: acknowledge + delegate. Heavy work goes to background agents via delegate skill.
              abortController,
              includePartialMessages: true,
              settingSources: [],
              ...(resumeId ? { resume: resumeId } : {}),
            },
          });

          let allText = "";
          let cost = 0;
          let streamedInCurrentTurn = 0;
          let gotAnyMessage = false;

          for await (const message of q) {
            gotAnyMessage = true;
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
                const content = assistantMsg.message.content;
                const fullText = content.filter(b => b.type === "text").map(b => (b as { type: "text"; text: string }).text).join("");

                if (fullText && streamedInCurrentTurn === 0) {
                  allText += fullText;
                  send({ type: "stream", agentId: "main", chunk: fullText });
                }
                streamedInCurrentTurn = 0;

                for (const block of content) {
                  if (block.type === "tool_use") {
                    const toolBlock = block as { type: "tool_use"; name: string; id?: string; input?: Record<string, unknown> };
                    if (toolBlock.name === "Agent") {
                      const input = toolBlock.input as { description?: string; prompt?: string } | undefined;
                      const desc = input?.description ?? input?.prompt ?? "running task";
                      const agentId = toolBlock.id ?? `sub-${Date.now()}`;
                      deps.bus.emit("agent:spawned", { id: agentId, task: desc, lane: "sub" });
                      deps.messages.append({ role: "agent-event", content: desc, metadata: { agentId, state: "spawned" } });
                    }
                  }
                }
                break;
              }

              case "user": {
                const userMsg = message as SDKUserMessage;
                for (const block of userMsg.message.content) {
                  if (block.type === "tool_result" && block.tool_use_id) {
                    deps.bus.emit("agent:completed", { id: block.tool_use_id, result: "", cost: 0 });
                  }
                }
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
          untrackAbortController(ws, abortController);

          if (!gotAnyMessage) throw new Error("No response from SDK");

          return { allText, cost };
        };

        const MAX_RETRIES = 5;
        const isRateLimit = (err: unknown): boolean => {
          const msg = err instanceof Error ? err.message : String(err);
          return msg.toLowerCase().includes("rate limit") || msg.includes("429") || msg.includes("overloaded");
        };

        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

        try {
          let result: { allText: string; cost: number } | null = null;
          let lastError: unknown = null;

          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
              const resumeId = attempt === 0 ? existingSessionId : undefined;
              if (attempt > 0) {
                // Clear session on retry
                sessionMap.delete(ws);
                lastSessionId = undefined;
              }
              result = await runQuery(resumeId);
              break; // success
            } catch (err) {
              lastError = err;
              const errMsg = err instanceof Error ? err.message : String(err);

              if (isRateLimit(err) && attempt < MAX_RETRIES) {
                const delay = Math.min(5000 * Math.pow(2, attempt), 60000); // 5s, 10s, 20s, 40s, 60s
                log.warn(`[rue] Rate limited (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay / 1000}s...`);
                send({ type: "stream", agentId: "main", chunk: attempt === 0 ? "One moment..." : "" });
                await sleep(delay);
              } else if (attempt === 0 && existingSessionId) {
                // First attempt with resume failed (not rate limit) — retry fresh
                log.error(`[rue] Session resume failed: ${errMsg}. Retrying fresh...`);
              } else {
                break; // non-retryable error
              }
            }
          }

          if (result) {
            // Allow AI to choose not to respond with [no_response]
            const cleanedText = result.allText.replace(/\[no_?response\]/gi, "").trim();
            if (cleanedText) {
              deps.messages.append({ role: "assistant", content: cleanedText });
              deps.bus.emit("message:created", { id: "", role: "assistant", content: cleanedText, timestamp: Date.now() });
            }

            // Memory is now handled by the agent via the memory skill
            // (not automatic extraction — the agent decides what to remember)

            send({ type: "result", id: frame.id, data: { output: cleanedText, cost: result.cost } });
          } else {
            const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
            log.error(`[rue] All retries failed: ${errMsg}`);
            send({ type: "stream", agentId: "main", chunk: "Sorry, I'm having trouble responding right now. Try again in a moment." });
            send({ type: "result", id: frame.id, data: { output: "Error: " + errMsg, cost: 0 } });
          }
        } catch (sdkError) {
          const message = sdkError instanceof Error ? sdkError.message : String(sdkError);
          log.error(`[rue] SDK error: ${message}`);
          send({ type: "error", id: frame.id, code: "SDK_ERROR", message });
        }
        break;
      }

      case "reset": {
        // Clear the Claude Code session — next ask starts fresh
        sessionMap.delete(ws);
        lastSessionId = undefined;
        send({ type: "result", id: frame.id, data: { ok: true } });
        break;
      }

      case "history": {
        const limit = (frame.args.limit as number) ?? 20;
        const messages = deps.messages.recent(limit);
        send({ type: "result", id: frame.id, data: { messages } });
        break;
      }

      case "status": {
        const agents = deps.supervisor.listAgents();
        send({
          type: "result",
          id: frame.id,
          data: {
            agents: agents.map((a) => ({
              id: a.id,
              task: a.config.task,
              state: a.state,
              lane: a.config.lane,
              cost: a.cost,
            })),
          },
        });
        break;
      }

      case "agents": {
        send({ type: "result", id: frame.id, data: { agents: deps.supervisor.listAgents() } });
        break;
      }

      default:
        send({ type: "error", id: frame.id, code: "UNKNOWN_CMD", message: `Unknown command: ${frame.cmd}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send({ type: "error", id: frame.id, code: "CMD_ERROR", message });
  }
}

function handleSubscribe(
  frame: Extract<ClientFrame, { type: "subscribe" }>,
  ws: WebSocket,
  bus: EventBus,
): void {
  let unsubs = wsUnsubscribers.get(ws);
  if (!unsubs) { unsubs = []; wsUnsubscribers.set(ws, unsubs); }

  for (const channel of frame.channels) {
    if (channel.endsWith("*")) {
      const unsub = bus.onWildcard(channel, (ch, payload) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(serializeDaemonFrame({ type: "event", channel: ch, payload }));
        }
      });
      unsubs.push(unsub);
    }
  }
}

