import type { EventBus } from "../bus/bus.js";
import type { AgentSupervisor } from "../agents/supervisor.js";
import type { Planner } from "../cortex/prefrontal/planner.js";
import type { ContextAssembler } from "../cortex/limbic/memory/assembler.js";
import type { MessageStore } from "../messages/store.js";
import type { ClientFrame, DaemonFrame } from "./protocol.js";
import type { WebSocket } from "ws";
import { serializeDaemonFrame } from "./protocol.js";

export interface HandlerDeps {
  projectRoot: string;
  bus: EventBus;
  supervisor: AgentSupervisor;
  planner: Planner;
  assembler: ContextAssembler;
  messages: MessageStore;
}

// Track session per WebSocket connection for conversation continuity.
// Also keep a global "last session" so new WS connections can resume.
const sessionMap = new WeakMap<WebSocket, string>();
let lastSessionId: string | undefined;

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
        console.log(`[rue] ask: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`);
        const systemPrompt = deps.assembler.assemble(text);
        const workdir = (frame.args.workdir as string) ?? deps.projectRoot;
        const existingSessionId = sessionMap.get(ws) ?? lastSessionId;

        // Persist user message
        deps.messages.append({ role: "user", content: text });
        deps.bus.emit("message:created", { id: "", role: "user", content: text, timestamp: Date.now() });

        // Try with session resume first, fall back to fresh session on failure
        const runQuery = async (resumeId: string | undefined) => {
          const { query } = await import("@anthropic-ai/claude-agent-sdk");

          const q = query({
            prompt: text,
            options: {
              cwd: workdir,
              systemPrompt,
              tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
              allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
              permissionMode: "bypassPermissions",
              allowDangerouslySkipPermissions: true,
              maxTurns: 50,
              abortController: new AbortController(),
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
                const sysMsg = message as { subtype?: string; session_id?: string };
                if (sysMsg.subtype === "init" && sysMsg.session_id) {
                  sessionMap.set(ws, sysMsg.session_id);
                  lastSessionId = sysMsg.session_id;
                }
                break;
              }

              case "stream_event": {
                const event = (message as { event?: { type?: string; delta?: { type?: string; text?: string } } }).event;
                if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
                  allText += event.delta.text;
                  streamedInCurrentTurn += event.delta.text.length;
                  send({ type: "stream", agentId: "main", chunk: event.delta.text });
                }
                break;
              }

              case "assistant": {
                const assistantMsg = message as {
                  message: { content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown>; id?: string }> };
                  parent_tool_use_id: string | null;
                };
                const content = assistantMsg.message.content;
                const fullText = content.filter(b => b.type === "text").map(b => b.text ?? "").join("");

                if (fullText && streamedInCurrentTurn === 0) {
                  allText += fullText;
                  send({ type: "stream", agentId: "main", chunk: fullText });
                }
                streamedInCurrentTurn = 0;

                for (const block of content) {
                  if (block.type === "tool_use" && block.name === "Agent") {
                    const input = block.input as { description?: string; prompt?: string } | undefined;
                    const desc = input?.description ?? input?.prompt ?? "running task";
                    const agentId = block.id ?? `sub-${Date.now()}`;
                    deps.bus.emit("agent:spawned", { id: agentId, task: desc, lane: "sub" });
                    deps.messages.append({ role: "agent-event", content: desc, metadata: { agentId, state: "spawned" } });
                  }
                }
                break;
              }

              case "user": {
                const userMsg = message as { message: { content: Array<{ type: string; tool_use_id?: string }> } };
                for (const block of userMsg.message.content) {
                  if (block.type === "tool_result" && block.tool_use_id) {
                    deps.bus.emit("agent:completed", { id: block.tool_use_id, result: "", cost: 0 });
                  }
                }
                break;
              }

              case "result": {
                const resultMsg = message as { subtype: string; total_cost_usd: number; result?: string; session_id?: string };
                cost = resultMsg.total_cost_usd;
                if (resultMsg.session_id) { sessionMap.set(ws, resultMsg.session_id); lastSessionId = resultMsg.session_id; }
                if (resultMsg.subtype === "success" && resultMsg.result && !allText) {
                  allText = resultMsg.result;
                  send({ type: "stream", agentId: "main", chunk: resultMsg.result });
                }
                break;
              }
            }
          }

          if (!gotAnyMessage) throw new Error("No response from SDK");

          return { allText, cost };
        };

        try {
          let result: { allText: string; cost: number };
          try {
            // Try with session resume
            result = await runQuery(existingSessionId);
          } catch (resumeErr) {
            // Resume failed — clear session and retry fresh
            console.error(`[rue] Session resume failed, starting fresh: ${resumeErr instanceof Error ? resumeErr.message : resumeErr}`);
            sessionMap.delete(ws);
            lastSessionId = undefined;
            result = await runQuery(undefined);
          }

          deps.messages.append({ role: "assistant", content: result.allText });
          deps.bus.emit("message:created", { id: "", role: "assistant", content: result.allText, timestamp: Date.now() });
          send({ type: "result", id: frame.id, data: { output: result.allText, cost: result.cost } });
        } catch (sdkError) {
          const message = sdkError instanceof Error ? sdkError.message : String(sdkError);
          console.error(`[rue] SDK error: ${message}`);
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
  for (const channel of frame.channels) {
    if (channel.endsWith("*")) {
      bus.onWildcard(channel, (ch, payload) => {
        ws.send(serializeDaemonFrame({ type: "event", channel: ch, payload }));
      });
    }
  }
}
