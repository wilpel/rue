import WebSocket from "ws";
import { frameId } from "../../shared/ids.js";
import type { DaemonFrame } from "../../gateway/protocol.js";
import { LAYOUT } from "./tui/theme.js";

type PendingRequest = {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  onStream?: (chunk: string) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type EventHandler = (channel: string, payload: unknown) => void;

export class DaemonClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private activeStreamId: string | null = null;
  private eventHandlers: EventHandler[] = [];
  private notifyHandlers: Array<(title: string, body: string) => void> = [];
  private reconnectingHandlers: Array<(attempt: number) => void> = [];
  private reconnectedHandlers: Array<() => void> = [];
  private disconnectedHandlers: Array<() => void> = [];

  private shouldReconnect = true;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSubscribedChannels: string[] = [];

  constructor(private readonly url: string) {}

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.shouldReconnect = true;
      this.setupWs(resolve, reject);
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearTimers();
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  private setupWs(onFirstOpen?: () => void, onFirstError?: (err: Error) => void): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempt = 0;
      this.startPing();
      if (this.lastSubscribedChannels.length > 0) {
        this.send({ type: "subscribe", channels: this.lastSubscribedChannels });
      }
      if (onFirstOpen) { onFirstOpen(); onFirstOpen = undefined; onFirstError = undefined; }
      else { for (const h of this.reconnectedHandlers) h(); }
    });

    ws.on("error", (err) => {
      if (onFirstError) { onFirstError(err); onFirstOpen = undefined; onFirstError = undefined; }
    });

    ws.on("close", () => {
      this.ws = null;
      this.stopPing();
      for (const [id, req] of this.pending) {
        clearTimeout(req.timer);
        req.reject(new Error("Connection lost"));
        this.pending.delete(id);
      }
      this.activeStreamId = null;
      if (this.shouldReconnect) this.scheduleReconnect();
      else { for (const h of this.disconnectedHandlers) h(); }
    });

    ws.on("pong", () => {
      if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
    });

    ws.on("message", (data: Buffer) => {
      try {
        const frame = JSON.parse(data.toString()) as DaemonFrame;
        this.handleFrame(frame);
      } catch { /* ignore parse errors */ }
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempt++;
    const delay = Math.min(
      LAYOUT.reconnectBaseMs * Math.pow(2, this.reconnectAttempt - 1),
      LAYOUT.reconnectMaxMs,
    );
    for (const h of this.reconnectingHandlers) h(this.reconnectAttempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.setupWs();
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
        this.pongTimer = setTimeout(() => {
          this.ws?.terminate();
        }, LAYOUT.pongTimeoutMs);
      }
    }, LAYOUT.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
  }

  private clearTimers(): void {
    this.stopPing();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  async ask(text: string, opts?: { onStream?: (chunk: string) => void }): Promise<{ output: string; cost: number }> {
    const id = frameId();
    this.activeStreamId = id;
    try {
      const result = await this.sendCmd(id, "ask", { text }, opts?.onStream) as { output: string; cost: number };
      return result;
    } finally {
      if (this.activeStreamId === id) this.activeStreamId = null;
    }
  }

  async status(): Promise<{ agents: unknown[] }> {
    return this.sendCmd(frameId(), "status", {}) as Promise<{ agents: unknown[] }>;
  }

  async agents(): Promise<{ agents: unknown[] }> {
    return this.sendCmd(frameId(), "agents", {}) as Promise<{ agents: unknown[] }>;
  }

  async reset(): Promise<{ ok: boolean }> {
    return this.sendCmd(frameId(), "reset", {}) as Promise<{ ok: boolean }>;
  }

  async tasks(): Promise<{ tasks: Array<{ id: string; title: string; type: string; status: string; priority: string; due_at?: number }> }> {
    return this.sendCmd(frameId(), "tasks", {}) as Promise<{ tasks: Array<{ id: string; title: string; type: string; status: string; priority: string; due_at?: number }> }>;
  }

  async history(limit = 20): Promise<{ messages: Array<{ id: string; role: string; content: string; timestamp: number; metadata?: Record<string, unknown> }> }> {
    return this.sendCmd(frameId(), "history", { limit }) as Promise<{ messages: Array<{ id: string; role: string; content: string; timestamp: number; metadata?: Record<string, unknown> }> }>;
  }

  steer(agentId: string, message: string): void {
    this.send({ type: "steer", agentId, message });
  }

  kill(agentId: string): void {
    this.send({ type: "kill", agentId });
  }

  subscribe(channels: string[]): void {
    this.lastSubscribedChannels = channels;
    this.send({ type: "subscribe", channels });
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => { const i = this.eventHandlers.indexOf(handler); if (i >= 0) this.eventHandlers.splice(i, 1); };
  }

  onNotify(handler: (title: string, body: string) => void): () => void {
    this.notifyHandlers.push(handler);
    return () => { const i = this.notifyHandlers.indexOf(handler); if (i >= 0) this.notifyHandlers.splice(i, 1); };
  }

  onReconnecting(handler: (attempt: number) => void): () => void {
    this.reconnectingHandlers.push(handler);
    return () => { const i = this.reconnectingHandlers.indexOf(handler); if (i >= 0) this.reconnectingHandlers.splice(i, 1); };
  }

  onReconnected(handler: () => void): () => void {
    this.reconnectedHandlers.push(handler);
    return () => { const i = this.reconnectedHandlers.indexOf(handler); if (i >= 0) this.reconnectedHandlers.splice(i, 1); };
  }

  onDisconnected(handler: () => void): () => void {
    this.disconnectedHandlers.push(handler);
    return () => { const i = this.disconnectedHandlers.indexOf(handler); if (i >= 0) this.disconnectedHandlers.splice(i, 1); };
  }

  private sendCmd(
    id: string,
    cmd: string,
    args: Record<string, unknown>,
    onStream?: (chunk: string) => void,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${cmd} timed out after ${LAYOUT.requestTimeoutMs}ms`));
      }, LAYOUT.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, onStream, timer });
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
          clearTimeout(req.timer);
          this.pending.delete(frame.id);
          req.resolve(frame.data);
        }
        break;
      }
      case "error": {
        const req = this.pending.get(frame.id);
        if (req) {
          clearTimeout(req.timer);
          this.pending.delete(frame.id);
          req.reject(new Error(`${frame.code}: ${frame.message}`));
        }
        break;
      }
      case "stream": {
        if (this.activeStreamId) {
          const req = this.pending.get(this.activeStreamId);
          req?.onStream?.(frame.chunk);
        }
        break;
      }
      case "event": {
        for (const handler of this.eventHandlers) handler(frame.channel, frame.payload);
        break;
      }
      case "notify": {
        for (const handler of this.notifyHandlers) handler(frame.title, frame.body);
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
