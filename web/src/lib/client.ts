export type DaemonFrame =
  | { type: "ack"; id: string }
  | { type: "stream"; agentId: string; chunk: string }
  | { type: "event"; channel: string; payload: unknown }
  | { type: "result"; id: string; data: unknown }
  | { type: "error"; id: string; code: string; message: string };

type PendingRequest = {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  onStream?: (chunk: string) => void;
};

type EventHandler = (channel: string, payload: unknown) => void;

let idCounter = 0;
function nextId(): string {
  return `f_${++idCounter}_${Date.now()}`;
}

export class RueClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventHandlers: EventHandler[] = [];
  private _connected = false;
  private connectPromise: Promise<void> | null = null;

  get connected(): boolean { return this._connected; }

  connect(url?: string): Promise<void> {
    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    // Use Vite proxy path in dev, direct in production
    if (!url) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      url = `${protocol}//${window.location.host}/ws`;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url!);
      this.ws.onopen = () => { this._connected = true; this.connectPromise = null; resolve(); };
      this.ws.onerror = () => { this.connectPromise = null; reject(new Error("Connection failed")); };
      this.ws.onclose = () => { this._connected = false; this.connectPromise = null; };
      this.ws.onmessage = (e) => {
        const frame = JSON.parse(e.data) as DaemonFrame;
        this.handleFrame(frame);
      };
    });
    return this.connectPromise;
  }

  disconnect(): void { this.ws?.close(); this._connected = false; }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => { const i = this.eventHandlers.indexOf(handler); if (i >= 0) this.eventHandlers.splice(i, 1); };
  }

  subscribe(channels: string[]): void {
    this.send({ type: "subscribe", channels });
  }

  async ask(text: string, opts?: { onStream?: (chunk: string) => void }): Promise<{ output: string; cost: number }> {
    const id = nextId();
    return this.sendCmd(id, "ask", { text }, opts?.onStream) as Promise<{ output: string; cost: number }>;
  }

  async status(): Promise<{ agents: unknown[] }> {
    return this.sendCmd(nextId(), "status", {}) as Promise<{ agents: unknown[] }>;
  }

  async history(limit = 20): Promise<{ messages: Array<{ id: string; role: string; content: string; timestamp: number; metadata?: Record<string, unknown> }> }> {
    return this.sendCmd(nextId(), "history", { limit }) as Promise<{ messages: Array<{ id: string; role: string; content: string; timestamp: number; metadata?: Record<string, unknown> }> }>;
  }

  async reset(): Promise<{ ok: boolean }> {
    return this.sendCmd(nextId(), "reset", {}) as Promise<{ ok: boolean }>;
  }

  private sendCmd(id: string, cmd: string, args: Record<string, unknown>, onStream?: (chunk: string) => void): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onStream });
      this.send({ type: "cmd", id, cmd, args });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error("Timeout")); } }, 300_000);
    });
  }

  private handleFrame(frame: DaemonFrame): void {
    switch (frame.type) {
      case "ack": break;
      case "result": { const r = this.pending.get(frame.id); if (r) { this.pending.delete(frame.id); r.resolve(frame.data); } break; }
      case "error": { const r = this.pending.get(frame.id); if (r) { this.pending.delete(frame.id); r.reject(new Error(`${frame.code}: ${frame.message}`)); } break; }
      case "stream": { for (const r of this.pending.values()) r.onStream?.(frame.chunk); break; }
      case "event": { for (const h of this.eventHandlers) h(frame.channel, frame.payload); break; }
    }
  }

  private send(data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("Not connected");
    this.ws.send(JSON.stringify(data));
  }
}
