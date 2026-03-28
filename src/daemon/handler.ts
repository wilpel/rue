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
        const unsub = deps.bus.on("agent:progress", (payload) => {
          send({ type: "stream", agentId: payload.id, chunk: payload.chunk });
        });
        try {
          const result = await deps.supervisor.spawn({
            task: text,
            lane: "main",
            workdir: (frame.args.workdir as string) ?? process.cwd(),
            systemPrompt,
            timeout: 300_000,
          });
          send({ type: "result", id: frame.id, data: { output: result.output, cost: result.cost } });
        } finally {
          unsub();
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
        send({ type: "result", id: frame.id, data: { agents: deps.supervisor.listAgents() } });
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
