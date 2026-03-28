import { nanoid } from "nanoid";

export function agentId(): string {
  return `agent_${nanoid(12)}`;
}

export function taskId(): string {
  return `task_${nanoid(12)}`;
}

export function eventId(): string {
  return `evt_${nanoid(16)}`;
}

export function frameId(): string {
  return `frame_${nanoid(10)}`;
}
