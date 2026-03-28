import type { EventBus } from "../bus/bus.js";
import type { AgentSupervisor } from "../agents/supervisor.js";
import type { Planner } from "../cortex/prefrontal/planner.js";
import type { ContextAssembler } from "../cortex/limbic/memory/assembler.js";
import type { ClientFrame, DaemonFrame } from "./protocol.js";
import type { WebSocket } from "ws";
import { serializeDaemonFrame } from "./protocol.js";

export interface HandlerDeps {
  bus: EventBus;
  supervisor: AgentSupervisor;
  planner: Planner;
  assembler: ContextAssembler;
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
        const systemPrompt = deps.assembler.assemble(text);
        const workdir = (frame.args.workdir as string) ?? process.cwd();

        // Run Claude directly for the main conversation — no supervisor,
        // no agent:spawned events. The supervisor is for background sub-agents.
        try {
          const { query } = await import("@anthropic-ai/claude-agent-sdk");

          const q = query({
            prompt: text,
            options: {
              cwd: workdir,
              systemPrompt,
              tools: { type: "preset", preset: "claude_code" },
              allowedTools: [
                "Read", "Write", "Edit", "Bash", "Glob", "Grep",
                "WebSearch", "WebFetch", "Agent",
              ],
              permissionMode: "bypassPermissions",
              allowDangerouslySkipPermissions: true,
              maxTurns: 50,
              abortController: new AbortController(),
              includePartialMessages: true,
            },
          });

          let streamedText = "";
          let cost = 0;

          for await (const message of q) {
            switch (message.type) {
              case "stream_event": {
                const event = (message as {
                  event?: { type?: string; delta?: { type?: string; text?: string } };
                }).event;
                if (
                  event?.type === "content_block_delta" &&
                  event.delta?.type === "text_delta" &&
                  event.delta.text
                ) {
                  streamedText += event.delta.text;
                  send({ type: "stream", agentId: "main", chunk: event.delta.text });
                }
                break;
              }

              case "assistant": {
                const content = (message as {
                  message: { content: Array<{ type: string; text?: string }> };
                }).message.content;
                const fullText = content
                  .filter((b) => b.type === "text")
                  .map((b) => b.text ?? "")
                  .join("");

                // Fallback: if no streaming events delivered text, send the full block
                if (!streamedText && fullText) {
                  streamedText = fullText;
                  send({ type: "stream", agentId: "main", chunk: fullText });
                }
                break;
              }

              case "result": {
                const resultMsg = message as {
                  subtype: string;
                  total_cost_usd: number;
                  result?: string;
                };
                cost = resultMsg.total_cost_usd;

                if (resultMsg.subtype === "success" && resultMsg.result && !streamedText) {
                  streamedText = resultMsg.result;
                  send({ type: "stream", agentId: "main", chunk: resultMsg.result });
                }
                break;
              }
            }
          }

          send({
            type: "result",
            id: frame.id,
            data: { output: streamedText, cost },
          });
        } catch (sdkError) {
          const message = sdkError instanceof Error ? sdkError.message : String(sdkError);
          send({ type: "error", id: frame.id, code: "SDK_ERROR", message });
        }
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
        send({
          type: "result",
          id: frame.id,
          data: { agents: deps.supervisor.listAgents() },
        });
        break;
      }

      default:
        send({
          type: "error",
          id: frame.id,
          code: "UNKNOWN_CMD",
          message: `Unknown command: ${frame.cmd}`,
        });
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
