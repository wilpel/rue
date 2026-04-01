import WebSocket from "ws";
import { frameId } from "../../shared/ids.js";
import type { DaemonFrame } from "../../gateway/protocol.js";

type PendingRequest = {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  onStream?: (chunk: string) => void;
};

export type EventHandler = (channel: string, payload: unknown) => void;

export class DaemonClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventHandlers: EventHandler[] = [];
  private notifyHandlers: Array<(title: string, body: string) => void> = [];

  constructor(private readonly url: string) {}

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on("open", () => resolve());
      this.ws.on("error", (err) => reject(err));
      this.ws.on("close", () => {
        // Reject all pending requests on disconnect
        for (const [, req] of this.pending) {
          req.reject(new Error("WebSocket disconnected"));
        }
        this.pending.clear();
        this.ws = null;
      });
      this.ws.on("message", (data) => {
        const frame = JSON.parse(data.toString()) as DaemonFrame;
        this.handleFrame(frame);
      });
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  onNotify(handler: (title: string, body: string) => void): () => void {
    this.notifyHandlers.push(handler);
    return () => {
      const idx = this.notifyHandlers.indexOf(handler);
      if (idx >= 0) this.notifyHandlers.splice(idx, 1);
    };
  }

  async ask(
    text: string,
    opts?: { onStream?: (chunk: string) => void },
  ): Promise<{ output: string; cost: number }> {
    const id = frameId();
    return this.sendCmd(id, "ask", { text }, opts?.onStream) as Promise<{
      output: string;
      cost: number;
    }>;
  }

  async status(): Promise<{ agents: unknown[] }> {
    const id = frameId();
    return this.sendCmd(id, "status", {}) as Promise<{ agents: unknown[] }>;
  }

  async agents(): Promise<{ agents: unknown[] }> {
    const id = frameId();
    return this.sendCmd(id, "agents", {}) as Promise<{ agents: unknown[] }>;
  }

  async reset(): Promise<{ ok: boolean }> {
    const id = frameId();
    return this.sendCmd(id, "reset", {}) as Promise<{ ok: boolean }>;
  }

  async tasks(): Promise<{ tasks: Array<{ id: string; title: string; type: string; status: string; priority: string; due_at?: number }> }> {
    const id = frameId();
    return this.sendCmd(id, "tasks", {}) as Promise<{ tasks: Array<{ id: string; title: string; type: string; status: string; priority: string; due_at?: number }> }>;
  }

  async history(limit = 20): Promise<{ messages: Array<{ id: string; role: string; content: string; timestamp: number; metadata?: Record<string, unknown> }> }> {
    const id = frameId();
    return this.sendCmd(id, "history", { limit }) as Promise<{ messages: Array<{ id: string; role: string; content: string; timestamp: number; metadata?: Record<string, unknown> }> }>;
  }

  steer(agentId: string, message: string): void {
    this.send({ type: "steer", agentId, message });
  }

  kill(agentId: string): void {
    this.send({ type: "kill", agentId });
  }

  subscribe(channels: string[]): void {
    this.send({ type: "subscribe", channels });
  }

  private sendCmd(
    id: string,
    cmd: string,
    args: Record<string, unknown>,
    onStream?: (chunk: string) => void,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onStream });
      this.send({ type: "cmd", id, cmd, args });
    });
  }

  private handleFrame(frame: DaemonFrame): void {
    switch (frame.type) {
      case "ack":
        break;
      case "result": {
        const req = this.pending.get(frame.id);
        if (req) {
          this.pending.delete(frame.id);
          req.resolve(frame.data);
        }
        break;
      }
      case "error": {
        const req = this.pending.get(frame.id);
        if (req) {
          this.pending.delete(frame.id);
          req.reject(new Error(`${frame.code}: ${frame.message}`));
        }
        break;
      }
      case "stream": {
        for (const req of this.pending.values()) {
          req.onStream?.(frame.chunk);
        }
        break;
      }
      case "event": {
        for (const handler of this.eventHandlers) {
          handler(frame.channel, frame.payload);
        }
        break;
      }
      case "notify": {
        for (const handler of this.notifyHandlers) {
          handler(frame.title, frame.body);
        }
        break;
      }
    }
  }

  private send(data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to daemon");
    }
    this.ws.send(JSON.stringify(data));
  }
}
