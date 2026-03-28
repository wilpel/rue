import { z } from "zod";

const CmdFrame = z.object({
  type: z.literal("cmd"),
  id: z.string(),
  cmd: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
});

const SteerFrame = z.object({
  type: z.literal("steer"),
  agentId: z.string(),
  message: z.string(),
});

const KillFrame = z.object({
  type: z.literal("kill"),
  agentId: z.string(),
});

const SubscribeFrame = z.object({
  type: z.literal("subscribe"),
  channels: z.array(z.string()),
});

const ClientFrameSchema = z.discriminatedUnion("type", [
  CmdFrame,
  SteerFrame,
  KillFrame,
  SubscribeFrame,
]);

export type ClientFrame = z.infer<typeof ClientFrameSchema>;

export type DaemonFrame =
  | { type: "ack"; id: string }
  | { type: "stream"; agentId: string; chunk: string }
  | { type: "event"; channel: string; payload: unknown }
  | { type: "result"; id: string; data: unknown }
  | { type: "error"; id: string; code: string; message: string }
  | { type: "notify"; severity: string; title: string; body: string };

export function parseClientFrame(raw: string): ClientFrame {
  const json = JSON.parse(raw);
  return ClientFrameSchema.parse(json);
}

export function serializeDaemonFrame(frame: DaemonFrame): string {
  return JSON.stringify(frame);
}
