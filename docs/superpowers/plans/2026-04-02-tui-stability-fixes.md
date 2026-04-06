# TUI Stability, UX & Performance Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 18 issues across stability, visual/UX, and performance categories plus replace the initial blank splash with an ASCII loading animation above the input bar.

**Architecture:** Extract shared constants/theme to a single file. Add reconnection, timeouts, keep-alive, and error boundary to the TUI client. Fix layout math, memoize expensive computations, and clean up resource leaks.

**Tech Stack:** TypeScript, React 19, Ink, ws (WebSocket)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/interfaces/cli/tui/theme.ts` | All colors, layout constants, named magic numbers |
| Create | `src/interfaces/cli/tui/ErrorBoundary.tsx` | React class-based error boundary |
| Create | `src/interfaces/cli/tui/LoadingScreen.tsx` | ASCII art loading animation shown during initial load |
| Modify | `src/interfaces/cli/client.ts` | Reconnection, keep-alive ping, request timeouts, stream race fix |
| Modify | `src/interfaces/cli/tui/App.tsx` | Use theme, remove 3s poll, fix subscription cleanup, track agent timers, use error boundary, use LoadingScreen |
| Modify | `src/interfaces/cli/tui/Sidebar.tsx` | Use theme, fix panel height (clamp >=1), add "N more" indicators, memoize usage graph |
| Modify | `src/interfaces/cli/tui/MessageList.tsx` | Use theme, fix scroll indicator, use terminal width for markdown |
| Modify | `src/interfaces/cli/tui/InputBar.tsx` | Use theme |
| Modify | `src/interfaces/cli/tui/StatusBar.tsx` | Use theme, show connection status |
| Modify | `src/interfaces/cli/tui/RueSpinner.tsx` | Use theme |
| Modify | `src/interfaces/cli/tui/markdown.ts` | Use theme, dynamic width |
| Modify | `src/interfaces/cli/tui/index.tsx` | Wrap App in ErrorBoundary |
| Create | `tests/interfaces/cli/client.test.ts` | Tests for reconnection, timeout, ping, race fix |
| Create | `tests/interfaces/cli/tui/theme.test.ts` | Theme constants sanity tests |

---

### Task 1: Create theme.ts — shared constants

**Files:**
- Create: `src/interfaces/cli/tui/theme.ts`
- Create: `tests/interfaces/cli/tui/theme.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/interfaces/cli/tui/theme.test.ts
import { describe, it, expect } from "vitest";
import { COLORS, LAYOUT } from "../../src/interfaces/cli/tui/theme.js";

describe("theme", () => {
  it("exports all required color keys", () => {
    expect(COLORS.primary).toBe("#E8B87A");
    expect(COLORS.secondary).toBe("#D4956B");
    expect(COLORS.success).toBe("#8BA87A");
    expect(COLORS.info).toBe("#7AA2D4");
    expect(COLORS.urgent).toBe("#C47070");
    expect(COLORS.dimmed).toBe("#6B6560");
    expect(COLORS.veryDim).toBe("#4A3F35");
    expect(COLORS.border).toBe("#3A3530");
    expect(COLORS.codeBg).toBe("#2A2520");
    expect(COLORS.codeText).toBe("#C9A87C");
    expect(COLORS.strongText).toBe("#E8CDA0");
    expect(COLORS.emText).toBe("#C9B89A");
    expect(COLORS.quoteText).toBe("#A89080");
  });

  it("exports layout constants", () => {
    expect(LAYOUT.chromeHeight).toBe(6);
    expect(LAYOUT.minContentHeight).toBe(8);
    expect(LAYOUT.sidebarBreakpoint).toBe(90);
    expect(LAYOUT.minSidebarWidth).toBe(28);
    expect(LAYOUT.sidebarRatio).toBe(0.3);
    expect(LAYOUT.agentPanelRatio).toBe(0.2);
    expect(LAYOUT.taskPanelRatio).toBe(0.2);
    expect(LAYOUT.usagePanelRatio).toBe(0.25);
    expect(LAYOUT.minPanelHeight).toBe(3);
    expect(LAYOUT.minUsagePanelHeight).toBe(5);
    expect(LAYOUT.maxEvents).toBe(50);
    expect(LAYOUT.taskPollIntervalMs).toBe(3000);
    expect(LAYOUT.tokenSampleIntervalMs).toBe(5000);
    expect(LAYOUT.usageHistoryMax).toBe(100);
    expect(LAYOUT.completedAgentLingerMs).toBe(3000);
    expect(LAYOUT.failedAgentLingerMs).toBe(5000);
  });

  it("exports network constants", () => {
    expect(LAYOUT.reconnectBaseMs).toBe(1000);
    expect(LAYOUT.reconnectMaxMs).toBe(30000);
    expect(LAYOUT.pingIntervalMs).toBe(30000);
    expect(LAYOUT.pongTimeoutMs).toBe(10000);
    expect(LAYOUT.requestTimeoutMs).toBe(60000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/interfaces/cli/tui/theme.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/interfaces/cli/tui/theme.ts

export const COLORS = {
  primary: "#E8B87A",
  secondary: "#D4956B",
  success: "#8BA87A",
  info: "#7AA2D4",
  urgent: "#C47070",
  dimmed: "#6B6560",
  veryDim: "#4A3F35",
  border: "#3A3530",
  codeBg: "#2A2520",
  codeText: "#C9A87C",
  strongText: "#E8CDA0",
  emText: "#C9B89A",
  quoteText: "#A89080",
} as const;

export const LAYOUT = {
  // Chrome (non-content) height: top bar (1) + spacer (1) + input (3) + status (1)
  chromeHeight: 6,
  minContentHeight: 8,

  // Sidebar
  sidebarBreakpoint: 90,
  minSidebarWidth: 28,
  sidebarRatio: 0.3,

  // Panel height ratios
  agentPanelRatio: 0.2,
  taskPanelRatio: 0.2,
  usagePanelRatio: 0.25,
  minPanelHeight: 3,
  minUsagePanelHeight: 5,

  // Data limits
  maxEvents: 50,
  usageHistoryMax: 100,

  // Polling / timers
  taskPollIntervalMs: 3000,
  tokenSampleIntervalMs: 5000,
  completedAgentLingerMs: 3000,
  failedAgentLingerMs: 5000,

  // Network
  reconnectBaseMs: 1000,
  reconnectMaxMs: 30000,
  pingIntervalMs: 30000,
  pongTimeoutMs: 10000,
  requestTimeoutMs: 60000,

  // Token estimation (Claude averages ~3.5 chars/token for English)
  charsPerToken: 3.5,
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/interfaces/cli/tui/theme.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/interfaces/cli/tui/theme.ts tests/interfaces/cli/tui/theme.test.ts
git commit -m "feat: add shared theme constants for TUI colors and layout"
```

---

### Task 2: Fix DaemonClient — reconnection, ping, timeouts, stream race

**Files:**
- Modify: `src/interfaces/cli/client.ts`
- Create: `tests/interfaces/cli/client.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/interfaces/cli/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DaemonClient } from "../../src/interfaces/cli/client.js";

// We test the public API behavior with a mock WebSocket
// The real WS is constructed internally, so we mock the 'ws' module
vi.mock("ws", () => {
  const handlers = new Map<string, Function[]>();
  const MockWS = vi.fn().mockImplementation(() => ({
    readyState: 1, // OPEN
    on: vi.fn((event: string, handler: Function) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    }),
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    // Helper to trigger events in tests
    _trigger: (event: string, ...args: unknown[]) => {
      for (const h of handlers.get(event) ?? []) h(...args);
    },
    _handlers: handlers,
  }));
  (MockWS as any).OPEN = 1;
  return { default: MockWS };
});

describe("DaemonClient", () => {
  let client: DaemonClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new DaemonClient("ws://localhost:3000");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("request times out after requestTimeoutMs", async () => {
    // Connect first
    const connectPromise = client.connect();
    // Trigger open on the internal ws
    const ws = (client as any).ws;
    ws._trigger("open");
    await connectPromise;

    // Now send a status request — it should timeout
    const promise = client.status();
    vi.advanceTimersByTime(60001);
    await expect(promise).rejects.toThrow("timed out");
  });

  it("emits reconnecting/reconnected events", async () => {
    const onReconnecting = vi.fn();
    const onReconnected = vi.fn();
    client.onReconnecting(onReconnecting);
    client.onReconnected(onReconnected);

    const connectPromise = client.connect();
    const ws = (client as any).ws;
    ws._trigger("open");
    await connectPromise;

    // Simulate close
    ws._trigger("close");

    // Should attempt reconnect after base delay
    expect(onReconnecting).toHaveBeenCalledWith(1);
  });

  it("only delivers stream to the ask that owns it", async () => {
    const connectPromise = client.connect();
    const ws = (client as any).ws;
    ws._trigger("open");
    await connectPromise;

    const chunks: string[] = [];
    const askPromise = client.ask("hello", {
      onStream: (chunk) => chunks.push(chunk),
    });

    // The activeStreamId should be set
    expect((client as any).activeStreamId).toBeTruthy();
    const streamId = (client as any).activeStreamId;

    // Deliver a stream frame
    ws._trigger("message", Buffer.from(JSON.stringify({
      type: "stream", agentId: "main", chunk: "hello ",
    })));

    expect(chunks).toEqual(["hello "]);

    // Complete the ask
    ws._trigger("message", Buffer.from(JSON.stringify({
      type: "result", id: streamId, data: { output: "hello world", cost: 0.01 },
    })));

    const result = await askPromise;
    expect(result.output).toBe("hello world");

    // After ask completes, activeStreamId should be null
    expect((client as any).activeStreamId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/interfaces/cli/client.test.ts`
Expected: FAIL — timeout/reconnect methods don't exist yet

- [ ] **Step 3: Rewrite client.ts with all fixes**

Replace the entire `src/interfaces/cli/client.ts` with:

```typescript
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

  // --- Issue #1: WS reconnection ---
  private setupWs(onFirstOpen?: () => void, onFirstError?: (err: Error) => void): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempt = 0;
      this.startPing();
      // Re-subscribe to channels on reconnect
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
      // Reject all pending requests
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

  // --- Issue #17: Keep-alive ping ---
  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
        this.pongTimer = setTimeout(() => {
          // No pong received — connection is hung, force close to trigger reconnect
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

  // --- Issue #4: Stream race condition fix ---
  async ask(text: string, opts?: { onStream?: (chunk: string) => void }): Promise<{ output: string; cost: number }> {
    const id = frameId();
    this.activeStreamId = id;
    try {
      const result = await this.sendCmd(id, "ask", { text }, opts?.onStream) as { output: string; cost: number };
      return result;
    } finally {
      // Only clear if WE are still the active stream (not if a new ask started)
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

  // --- Issue #2 & #18: Request timeout ---
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
        // Issue #4: Only deliver to the SPECIFIC active ask, not just "if there's an active ask"
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/interfaces/cli/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/interfaces/cli/client.ts tests/interfaces/cli/client.test.ts
git commit -m "fix: add WS reconnection, keep-alive ping, request timeouts, stream race fix"
```

---

### Task 3: Create ErrorBoundary component

**Files:**
- Create: `src/interfaces/cli/tui/ErrorBoundary.tsx`
- Modify: `src/interfaces/cli/tui/index.tsx`

- [ ] **Step 1: Create ErrorBoundary**

```tsx
// src/interfaces/cli/tui/ErrorBoundary.tsx
import React from "react";
import { Box, Text } from "ink";
import { COLORS } from "./theme.js";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Box flexDirection="column" padding={2}>
          <Text color={COLORS.urgent} bold>rue crashed</Text>
          <Text color={COLORS.dimmed}>{this.state.error.message}</Text>
          <Box marginTop={1}>
            <Text color={COLORS.veryDim}>{this.state.error.stack?.split("\n").slice(1, 5).join("\n")}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={COLORS.dimmed}>Press ctrl+c to exit</Text>
          </Box>
        </Box>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Wrap App in ErrorBoundary in index.tsx**

Replace the render call in `src/interfaces/cli/tui/index.tsx`:

```tsx
import { render } from "ink";
import { App } from "./App.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { DaemonClient } from "../client.js";

export async function startTUI(daemonUrl: string) {
  const client = new DaemonClient(daemonUrl);

  try {
    await client.connect();
  } catch {
    console.error(
      "Could not connect to Rue daemon. Start it first: rue daemon start",
    );
    process.exit(1);
  }

  const { waitUntilExit } = render(
    <ErrorBoundary>
      <App client={client} />
    </ErrorBoundary>
  );

  await waitUntilExit();
  client.disconnect();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/interfaces/cli/tui/ErrorBoundary.tsx src/interfaces/cli/tui/index.tsx
git commit -m "feat: add error boundary to prevent TUI crashes"
```

---

### Task 4: Create LoadingScreen component (replaces blank splash)

**Files:**
- Create: `src/interfaces/cli/tui/LoadingScreen.tsx`

- [ ] **Step 1: Create LoadingScreen**

```tsx
// src/interfaces/cli/tui/LoadingScreen.tsx
import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { COLORS } from "./theme.js";

const LOADING_FRAMES = [
  [
    "     .  ·  .     ",
    "   ·  .    .  ·  ",
    "  .    ◦    .    ",
    "   ·  .    .  ·  ",
    "     .  ·  .     ",
  ],
  [
    "    .   ·   .    ",
    "  ·   .    .   · ",
    " .     ●     .   ",
    "  ·   .    .   · ",
    "    .   ·   .    ",
  ],
  [
    "   .    ·    .   ",
    " ·    .    .    ·",
    ".      ◉      .  ",
    " ·    .    .    ·",
    "   .    ·    .   ",
  ],
  [
    "  .     ·     .  ",
    "·     .    .     ",
    "       ✦         ",
    "·     .    .     ",
    "  .     ·     .  ",
  ],
  [
    "   .    ·    .   ",
    " ·    .    .    ·",
    ".      ◉      .  ",
    " ·    .    .    ·",
    "   .    ·    .   ",
  ],
  [
    "    .   ·   .    ",
    "  ·   .    .   · ",
    " .     ●     .   ",
    "  ·   .    .   · ",
    "    .   ·   .    ",
  ],
];

interface LoadingScreenProps {
  height: number;
  width: number;
}

export function LoadingScreen({ height, width }: LoadingScreenProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % LOADING_FRAMES.length);
    }, 300);
    return () => clearInterval(timer);
  }, []);

  const art = LOADING_FRAMES[frame];
  // Center vertically: leave space for input bar below
  const topPadding = Math.max(0, Math.floor((height - art.length - 3) / 2));

  return (
    <Box flexDirection="column" height={height} width={width} alignItems="center">
      <Box height={topPadding} />
      {art.map((line, i) => (
        <Text key={i} color={COLORS.primary}>{line}</Text>
      ))}
      <Box marginTop={1}>
        <Text color={COLORS.primary} bold>rue</Text>
        <Text color={COLORS.dimmed}> waking up...</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/interfaces/cli/tui/LoadingScreen.tsx
git commit -m "feat: add ASCII loading animation component"
```

---

### Task 5: Fix App.tsx — subscriptions, timers, loading screen, theme, remove redundant poll

**Files:**
- Modify: `src/interfaces/cli/tui/App.tsx`

This task fixes issues: #3 (subscription leak), #5 (agent timer cleanup), #6 (loading screen), #13 (redundant poll removed — task events already trigger refresh), #15 (token estimation).

- [ ] **Step 1: Rewrite App.tsx**

Replace the full content of `src/interfaces/cli/tui/App.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { MessageList } from "./MessageList.js";
import { InputBar } from "./InputBar.js";
import { StatusBar } from "./StatusBar.js";
import { Sidebar, type EventEntry, type TaskInfo } from "./Sidebar.js";
import { LoadingScreen } from "./LoadingScreen.js";
import { DaemonClient } from "../client.js";
import { COLORS, LAYOUT } from "./theme.js";

export interface AgentActivity {
  id: string;
  task: string;
  state: "spawned" | "running" | "completed" | "failed" | "killed";
  startedAt: number;
  lane: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface AppProps {
  client: DaemonClient;
}

export function App({ client }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agents, setAgents] = useState<Map<string, AgentActivity>>(new Map());
  const [totalCost, setTotalCost] = useState(0);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [usageHistory, setUsageHistory] = useState<Array<{ tokens: number; timestamp: number }>>([]);
  const [, setTokensSinceLastSample] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [connectionState, setConnectionState] = useState<"connected" | "reconnecting" | "disconnected">("connected");
  const [initialLoading, setInitialLoading] = useState(true);

  // Issue #5: Track agent cleanup timers so we can cancel on unmount
  const agentTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup agent timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of agentTimersRef.current.values()) clearTimeout(timer);
      agentTimersRef.current.clear();
    };
  }, []);

  // Sample token usage
  useEffect(() => {
    const timer = setInterval(() => {
      setTokensSinceLastSample((current) => {
        setUsageHistory((prev) => [...prev.slice(-LAYOUT.usageHistoryMax), { tokens: current, timestamp: Date.now() }]);
        return 0;
      });
    }, LAYOUT.tokenSampleIntervalMs);
    return () => clearInterval(timer);
  }, []);

  const termHeight = stdout?.rows ?? 24;
  const termWidth = stdout?.columns ?? 80;

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      client.disconnect();
      exit();
    }
  });

  // Issue #1: Track connection state
  useEffect(() => {
    const unsubReconnecting = client.onReconnecting(() => setConnectionState("reconnecting"));
    const unsubReconnected = client.onReconnected(() => setConnectionState("connected"));
    const unsubDisconnected = client.onDisconnected(() => setConnectionState("disconnected"));
    return () => { unsubReconnecting(); unsubReconnected(); unsubDisconnected(); };
  }, [client]);

  // Load message history on startup
  useEffect(() => {
    client.history(20).then((result) => {
      const restored: ChatMessage[] = result.messages
        .filter((m) => m.role !== "agent-event")
        .map((m) => ({
          id: m.id,
          role: m.role as ChatMessage["role"],
          content: m.content,
          timestamp: m.timestamp,
        }));
      if (restored.length > 0) setMessages(restored);
    }).catch(() => {}).finally(() => setInitialLoading(false));
  }, [client]);

  // Issue #13: Task polling — only poll as fallback; events trigger immediate refresh
  const fetchTasks = useCallback(() => {
    if (!isLoading) {
      client.tasks().then(result => setTasks(result.tasks ?? [])).catch(() => {});
    }
  }, [client, isLoading]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, LAYOUT.taskPollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // Issue #3: Proper subscription cleanup — unsub both onNotify and onEvent
  useEffect(() => {
    const unsubNotify = client.onNotify((_title, body) => {
      if (body) {
        setMessages((prev) => [...prev, {
          id: `notify-${Date.now()}`,
          role: "assistant",
          content: body,
          timestamp: Date.now(),
        }]);
      }
    });
    return unsubNotify;
  }, [client]);

  useEffect(() => {
    client.subscribe(["agent:*", "task:*", "system:*", "delegate:*"]);

    const unsub = client.onEvent((channel, payload) => {
      const data = payload as Record<string, unknown>;

      if (channel.startsWith("task:")) fetchTasks();

      if (!channel.startsWith("message:") && !channel.startsWith("interface:")) {
        let summary = "";
        if (channel === "delegate:question") {
          summary = `? ${data.question as string ?? ""}`;
        } else if (channel === "delegate:answer") {
          summary = `> ${data.answer as string ?? ""}`;
        } else {
          summary = data.task as string ?? data.result as string ?? data.error as string ?? data.reason as string ?? data.output as string ?? "";
        }
        setEvents((prev) => [...prev.slice(-LAYOUT.maxEvents), { channel, summary, timestamp: Date.now() }]);
      }

      switch (channel) {
        case "agent:spawned":
          setAgents((prev) => new Map(prev).set(data.id as string, {
            id: data.id as string,
            task: data.task as string,
            state: "spawned",
            startedAt: Date.now(),
            lane: data.lane as string,
          }));
          break;
        case "agent:completed": {
          const id = data.id as string;
          if (typeof data.cost === "number") setTotalCost((prev) => prev + (data.cost as number));
          const inTok = (data.inputTokens as number) ?? 0;
          const outTok = (data.outputTokens as number) ?? 0;
          if (inTok + outTok > 0) {
            setTokensSinceLastSample((prev) => prev + inTok + outTok);
            setTotalTokens((prev) => prev + inTok + outTok);
          }
          setAgents((prev) => {
            const next = new Map(prev);
            const existing = next.get(id);
            if (existing) next.set(id, { ...existing, state: "completed" });
            return next;
          });
          // Issue #5: Track timer for cleanup
          const existingTimer = agentTimersRef.current.get(id);
          if (existingTimer) clearTimeout(existingTimer);
          const timer = setTimeout(() => {
            setAgents((p) => { const n = new Map(p); n.delete(id); return n; });
            agentTimersRef.current.delete(id);
          }, LAYOUT.completedAgentLingerMs);
          agentTimersRef.current.set(id, timer);
          break;
        }
        case "agent:failed":
        case "agent:killed": {
          const id = data.id as string;
          const state = channel.split(":")[1] as AgentActivity["state"];
          setAgents((prev) => {
            const next = new Map(prev);
            const existing = next.get(id);
            if (existing) next.set(id, { ...existing, state });
            return next;
          });
          const existingTimer = agentTimersRef.current.get(id);
          if (existingTimer) clearTimeout(existingTimer);
          const timer = setTimeout(() => {
            setAgents((p) => { const n = new Map(p); n.delete(id); return n; });
            agentTimersRef.current.delete(id);
          }, LAYOUT.failedAgentLingerMs);
          agentTimersRef.current.set(id, timer);
          break;
        }
      }
    });

    return unsub;
  }, [client, fetchTasks]);

  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim()) return;

    if (text.startsWith("/")) {
      await handleSlashCommand(text, setMessages, client, agents);
      return;
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);

    try {
      const result = await client.ask(text, {
        onStream: (chunk) => {
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, content: m.content + chunk } : m),
          );
          // Issue #15: Better token estimation (~3.5 chars/token for Claude)
          const estimatedTokens = Math.ceil(chunk.length / LAYOUT.charsPerToken);
          setTokensSinceLastSample((prev) => prev + estimatedTokens);
        },
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || result.output || "(no response)", isStreaming: false }
            : m,
        ),
      );
      if (result.cost) setTotalCost((prev) => prev + result.cost);
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Error: ${err instanceof Error ? err.message : String(err)}`, isStreaming: false }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [client, isLoading, agents]);

  const activeAgents = Array.from(agents.values());
  const contentHeight = Math.max(LAYOUT.minContentHeight, termHeight - LAYOUT.chromeHeight);
  const showSidebar = termWidth >= LAYOUT.sidebarBreakpoint;
  const sidebarWidth = showSidebar ? Math.max(LAYOUT.minSidebarWidth, Math.floor(termWidth * LAYOUT.sidebarRatio)) : 0;
  const messageWidth = termWidth - sidebarWidth;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Top bar */}
      <Box paddingX={2} justifyContent="space-between" width={termWidth}>
        <Box>
          <Text color={COLORS.primary} bold> .-.  </Text>
          <Text color={COLORS.primary} bold>rue</Text>
          <Text color={COLORS.veryDim}> | </Text>
          <Text color={COLORS.dimmed}>your ai daemon</Text>
        </Box>
        <Box>
          {connectionState === "reconnecting" && <Text color={COLORS.secondary}>reconnecting... </Text>}
          {connectionState === "disconnected" && <Text color={COLORS.urgent}>disconnected </Text>}
          <Text color={COLORS.dimmed}>v0.1.0</Text>
        </Box>
      </Box>

      {/* Main content area */}
      <Box flexDirection="row" height={contentHeight}>
        <Box flexDirection="column" width={messageWidth} height={contentHeight} overflow="hidden">
          {initialLoading ? (
            <LoadingScreen height={contentHeight} width={messageWidth} />
          ) : (
            <MessageList messages={messages} height={contentHeight} width={messageWidth} isLoading={isLoading} />
          )}
        </Box>

        {showSidebar && (
          <Sidebar
            agents={activeAgents}
            tasks={tasks}
            events={events}
            usageHistory={usageHistory}
            totalCost={totalCost}
            totalTokens={totalTokens}
            height={contentHeight}
            width={sidebarWidth}
          />
        )}
      </Box>

      {/* Input bar */}
      <InputBar onSubmit={handleSubmit} isLoading={isLoading} />

      {/* Status bar */}
      <StatusBar
        agentCount={activeAgents.filter(a => a.state === "spawned" || a.state === "running").length}
        isLoading={isLoading}
        totalCost={totalCost}
        width={termWidth}
        connectionState={connectionState}
      />
    </Box>
  );
}

async function handleSlashCommand(
  text: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  client: DaemonClient,
  agents: Map<string, AgentActivity>,
) {
  const cmd = text.slice(1).trim().toLowerCase();
  const sysMsg = (content: string) => ({
    id: `sys-${Date.now()}`, role: "system" as const, content, timestamp: Date.now(),
  });

  switch (cmd) {
    case "agents": {
      const list = Array.from(agents.values());
      if (list.length === 0) {
        setMessages((prev) => [...prev, sysMsg("No agents running.")]);
      } else {
        const lines = list.map((a) => {
          const elapsed = formatElapsed(Date.now() - a.startedAt);
          const icon = a.state === "spawned" || a.state === "running" ? "~" : a.state === "completed" ? "+" : "x";
          return `  ${icon} ${a.id.slice(0, 20)} | ${a.state} | ${a.lane} | ${elapsed}\n    ${a.task}`;
        });
        setMessages((prev) => [...prev, sysMsg(`Active agents:\n${lines.join("\n")}`)]);
      }
      break;
    }
    case "clear":
      setMessages([]);
      break;
    case "reset":
      try {
        await client.reset();
        setMessages([sysMsg("Session reset.")]);
      } catch {
        setMessages((prev) => [...prev, sysMsg("Failed to reset session.")]);
      }
      break;
    case "help":
      setMessages((prev) => [...prev, sysMsg(
        "/agents — list agents  /clear — clear chat  /reset — new session  /help — this message\nctrl+c — quit",
      )]);
      break;
    default:
      setMessages((prev) => [...prev, sysMsg(`Unknown: /${cmd}. Try /help`)]);
  }
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${seconds % 60}s`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/interfaces/cli/tui/App.tsx
git commit -m "fix: subscription cleanup, timer tracking, loading screen, theme constants"
```

---

### Task 6: Fix Sidebar — panel heights, memoize usage, "N more" indicators, theme

**Files:**
- Modify: `src/interfaces/cli/tui/Sidebar.tsx`

Fixes issues: #7 (panel heights can go negative), #11 (no "N more" indicators), #12 (magic numbers), #14 (usage graph not memoized).

- [ ] **Step 1: Rewrite Sidebar.tsx**

Replace the full content of `src/interfaces/cli/tui/Sidebar.tsx`:

```tsx
import { useMemo } from "react";
import { Box, Text } from "ink";
import { RueSpinner } from "./RueSpinner.js";
import { COLORS, LAYOUT } from "./theme.js";
import type { AgentActivity } from "./App.js";

export interface TaskInfo {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  due_at?: number;
}

export interface UsagePoint {
  tokens: number;
  timestamp: number;
}

interface SidebarProps {
  agents: AgentActivity[];
  tasks: TaskInfo[];
  events: EventEntry[];
  usageHistory: UsagePoint[];
  totalCost: number;
  totalTokens: number;
  height: number;
  width: number;
}

export interface EventEntry {
  channel: string;
  summary: string;
  timestamp: number;
}

export function Sidebar({ agents, tasks, events, usageHistory, totalCost, totalTokens, height, width }: SidebarProps) {
  // Issue #7: Clamp all panels to minimum 1 line, ensure eventPanel never goes negative
  const agentPanelHeight = Math.max(LAYOUT.minPanelHeight, Math.floor(height * LAYOUT.agentPanelRatio));
  const taskPanelHeight = Math.max(LAYOUT.minPanelHeight, Math.floor(height * LAYOUT.taskPanelRatio));
  const usagePanelHeight = Math.max(LAYOUT.minUsagePanelHeight, Math.floor(height * LAYOUT.usagePanelRatio));
  const eventPanelHeight = Math.max(LAYOUT.minPanelHeight, height - agentPanelHeight - taskPanelHeight - usagePanelHeight);

  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="single" borderColor={COLORS.border} borderLeft borderTop={false} borderBottom={false} borderRight={false}>
      <AgentsPanel agents={agents} height={agentPanelHeight} width={width} />
      <TasksPanel tasks={tasks} height={taskPanelHeight} width={width} />
      <UsagePanel history={usageHistory} totalCost={totalCost} totalTokens={totalTokens} height={usagePanelHeight} width={width} />
      <EventsPanel events={events} height={eventPanelHeight} width={width} />
    </Box>
  );
}

function PanelHeader({ title, count }: { title: string; count?: number }) {
  return (
    <>
      <Box>
        <Text color={COLORS.primary} bold> {title} </Text>
        {count !== undefined && count > 0 && <Text color={COLORS.info}>({count})</Text>}
      </Box>
      <Box borderStyle="single" borderColor={COLORS.border} borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text> </Text>
      </Box>
    </>
  );
}

function AgentsPanel({ agents, height, width }: { agents: AgentActivity[]; height: number; width: number }) {
  const activeAgents = agents.filter(a => a.state === "spawned" || a.state === "running");
  const recentDone = agents.filter(a => a.state === "completed" || a.state === "failed" || a.state === "killed").slice(-3);
  const all = [...activeAgents, ...recentDone];
  const maxVisible = Math.max(0, height - 2);
  const visible = all.slice(0, maxVisible);
  const overflow = all.length - visible.length;

  return (
    <Box flexDirection="column" height={height} paddingX={1} overflow="hidden">
      <PanelHeader title="Agents" count={activeAgents.length} />
      {visible.length === 0 ? (
        <Box paddingLeft={1}><Text color={COLORS.veryDim}>no agents</Text></Box>
      ) : (
        <Box flexDirection="column">
          {visible.map((agent) => (
            <SidebarAgentRow key={agent.id} agent={agent} maxWidth={width - 4} />
          ))}
          {/* Issue #11: Show overflow count */}
          {overflow > 0 && <Box paddingLeft={1}><Text color={COLORS.veryDim}>+{overflow} more</Text></Box>}
        </Box>
      )}
    </Box>
  );
}

function SidebarAgentRow({ agent, maxWidth }: { agent: AgentActivity; maxWidth: number }) {
  const isActive = agent.state === "spawned" || agent.state === "running";
  const isMain = agent.lane === "main";
  const activeColor = isMain ? COLORS.success : COLORS.secondary;
  const color = isActive ? activeColor : agent.state === "completed" ? COLORS.dimmed : COLORS.urgent;
  const icon = isActive ? "" : agent.state === "completed" ? "+" : "x";
  const elapsed = formatElapsed(Date.now() - agent.startedAt);

  return (
    <Box paddingLeft={1} width={maxWidth}>
      <Text color={color}>{isActive ? <RueSpinner /> : icon} </Text>
      <Text color={isMain ? COLORS.success : COLORS.dimmed} wrap="truncate">{agent.task} </Text>
      <Text color={COLORS.veryDim}>{elapsed}</Text>
    </Box>
  );
}

function TasksPanel({ tasks, height, width }: { tasks: TaskInfo[]; height: number; width: number }) {
  const maxVisible = Math.max(0, height - 2);
  const visible = tasks.slice(0, maxVisible);
  const overflow = tasks.length - visible.length;
  const contentWidth = width - 4;

  return (
    <Box flexDirection="column" height={height} paddingX={1} overflow="hidden">
      <PanelHeader title="Tasks" count={tasks.length} />
      {visible.length === 0 ? (
        <Box paddingLeft={1}><Text color={COLORS.veryDim}>no tasks</Text></Box>
      ) : (
        <Box flexDirection="column">
          {visible.map((task) => (
            <TaskRow key={task.id} task={task} maxWidth={contentWidth} />
          ))}
          {overflow > 0 && <Box paddingLeft={1}><Text color={COLORS.veryDim}>+{overflow} more</Text></Box>}
        </Box>
      )}
    </Box>
  );
}

function TaskRow({ task, maxWidth }: { task: TaskInfo; maxWidth: number }) {
  const typeIcon = task.type === "scheduled" ? "[S]" : task.type === "reminder" ? "[R]" : "[W]";
  const priorityColor = task.priority === "urgent" ? COLORS.urgent : task.priority === "high" ? COLORS.secondary : task.priority === "normal" ? COLORS.dimmed : COLORS.veryDim;
  const dueStr = task.due_at ? formatRelativeTime(task.due_at) : "";

  return (
    <Box paddingLeft={1} width={maxWidth}>
      <Text color={COLORS.info}>{typeIcon} </Text>
      <Text color={priorityColor} wrap="truncate">{task.title} </Text>
      {dueStr ? <Text color={COLORS.veryDim}>{dueStr}</Text> : null}
    </Box>
  );
}

// Issue #14: Memoize usage graph rendering
function UsagePanel({ history, totalCost, totalTokens, height, width }: { history: UsagePoint[]; totalCost: number; totalTokens: number; height: number; width: number }) {
  const graphWidth = width - 4;
  const graphHeight = Math.max(1, height - 3);

  const rows = useMemo(() => {
    const raw = history.slice(-graphWidth);
    const padCount = Math.max(0, graphWidth - raw.length);
    const values = [...Array(padCount).fill(0), ...raw.map(p => p.tokens)];
    const allTimeMax = Math.max(...history.map(p => p.tokens), 1);
    const normalized = values.map(v => (v / allTimeMax) * graphHeight);

    const result: string[] = [];
    for (let row = graphHeight - 1; row >= 0; row--) {
      let line = "";
      for (let col = 0; col < graphWidth; col++) {
        const val = normalized[col];
        if (val > row + 0.75) line += "\u2588";
        else if (val > row + 0.5) line += "\u2593";
        else if (val > row + 0.25) line += "\u2592";
        else if (val > row) line += "\u2591";
        else line += " ";
      }
      result.push(line);
    }
    return result;
  }, [history, graphWidth, graphHeight]);

  const formatTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

  return (
    <Box flexDirection="column" height={height} paddingX={1} overflow="hidden">
      <Box justifyContent="space-between" width={width - 3}>
        <Box>
          <Text color={COLORS.primary} bold> Tokens </Text>
          <Text color={COLORS.dimmed}>{formatTokens(totalTokens)}</Text>
        </Box>
        <Text color={COLORS.veryDim}>${totalCost.toFixed(2)}</Text>
      </Box>
      <Box borderStyle="single" borderColor={COLORS.border} borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text> </Text>
      </Box>
      {totalTokens === 0 ? (
        <Box paddingLeft={1}><Text color={COLORS.veryDim}>no usage yet</Text></Box>
      ) : (
        <Box flexDirection="column">
          {rows.map((row, i) => (
            <Text key={i} color={COLORS.secondary}>{row}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function EventsPanel({ events, height, width }: { events: EventEntry[]; height: number; width: number }) {
  const maxEvents = Math.max(1, Math.floor((height - 2) / 2));
  const reversed = [...events].reverse();
  const visible = reversed.slice(0, maxEvents);
  const overflow = reversed.length - visible.length;
  const contentWidth = width - 4;

  return (
    <Box flexDirection="column" height={height} paddingX={1} overflow="hidden">
      <PanelHeader title="Events" />
      {visible.length === 0 ? (
        <Box paddingLeft={1}><Text color={COLORS.veryDim}>no events</Text></Box>
      ) : (
        <Box flexDirection="column" overflow="hidden">
          {visible.map((evt, i) => (
            <EventRow key={`${evt.timestamp}-${i}`} event={evt} maxWidth={contentWidth} />
          ))}
          {overflow > 0 && <Box paddingLeft={1}><Text color={COLORS.veryDim}>+{overflow} more</Text></Box>}
        </Box>
      )}
    </Box>
  );
}

function EventRow({ event, maxWidth }: { event: EventEntry; maxWidth: number }) {
  const time = formatTime(event.timestamp);
  const tag = event.channel.split(":").pop() ?? event.channel;

  const channelColor = event.channel === "delegate:question" ? COLORS.info
    : event.channel === "delegate:answer" ? COLORS.success
    : event.channel.startsWith("agent:") ? COLORS.secondary
    : event.channel.startsWith("system:") ? COLORS.success
    : event.channel.startsWith("task:") ? COLORS.info
    : COLORS.dimmed;

  return (
    <Box paddingLeft={1} width={maxWidth}>
      <Text color={COLORS.veryDim}>{time} </Text>
      <Text color={channelColor} bold>{tag} </Text>
      {event.summary ? <Text color={COLORS.dimmed} wrap="truncate">{event.summary.slice(0, maxWidth - 18)}</Text> : null}
    </Box>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "due";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${seconds % 60}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/interfaces/cli/tui/Sidebar.tsx
git commit -m "fix: sidebar panel heights, memoize usage graph, add overflow indicators, use theme"
```

---

### Task 7: Fix MessageList — scroll indicator, theme, dynamic markdown width

**Files:**
- Modify: `src/interfaces/cli/tui/MessageList.tsx`
- Modify: `src/interfaces/cli/tui/markdown.ts`

Fixes issues: #9 (markdown width hardcoded to 100), #10 (scroll indicator uses position="absolute").

- [ ] **Step 1: Fix markdown.ts — accept dynamic width**

Replace `src/interfaces/cli/tui/markdown.ts`:

```typescript
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";
import { COLORS } from "./theme.js";

let highlightFn: ((code: string, opts?: { language?: string }) => string) | null = null;
try {
  const mod = await import("cli-highlight");
  highlightFn = mod.highlight;
} catch { /* syntax highlighting unavailable */ }

// Issue #9: Accept dynamic width instead of hardcoded 100
let currentWidth = 100;

function createMarked(width: number): Marked {
  const m = new Marked();
  m.use(
    markedTerminal({
      codespan: (text: string) => chalk.hex(COLORS.primary).bgHex(COLORS.codeBg)(` ${text} `),
      strong: (text: string) => chalk.hex(COLORS.strongText).bold(text),
      em: (text: string) => chalk.hex(COLORS.emText).italic(text),
      heading: (text: string) => "\n" + chalk.hex(COLORS.primary).bold(text),
      blockquote: (text: string) => chalk.hex(COLORS.quoteText)(`  | ${text}`),
      link: (href: string, _title: string, text: string) => `${text} ${chalk.hex(COLORS.secondary).underline(`(${href})`)}`,
      list: (body: string) => "\n" + body,
      listitem: (text: string) => {
        const clean = text.replace(/^\s*[*\-\u2022]\s*/, "").trim();
        return `  ${chalk.hex(COLORS.primary)("\u2022")} ${clean}\n`;
      },
      tab: 2,
      width,
      reflowText: true,
      showSectionPrefix: false,
    } as any),
  );
  return m;
}

let marked = createMarked(currentWidth);

export function renderMarkdown(text: string, width?: number): string {
  if (width && width !== currentWidth) {
    currentWidth = width;
    marked = createMarked(width);
  }

  try {
    const codeBlocks: Array<{ lang: string; code: string }> = [];
    const withPlaceholders = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
      codeBlocks.push({ lang, code: code.trimEnd() });
      return `\n%%CODE_${codeBlocks.length - 1}%%\n`;
    });

    let rendered = marked.parse(withPlaceholders) as string;

    for (let i = 0; i < codeBlocks.length; i++) {
      rendered = rendered.replace(`%%CODE_${i}%%`, renderCodeInline(codeBlocks[i].lang, codeBlocks[i].code));
    }

    return rendered
      .replace(/^(\s*)\*\s+(\u2022)/gm, "$1$2")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return text;
  }
}

function renderCodeInline(lang: string, code: string): string {
  let highlighted: string;
  if (highlightFn && lang) {
    try {
      highlighted = highlightFn(code, { language: lang });
    } catch {
      highlighted = chalk.hex(COLORS.codeText)(code);
    }
  } else {
    highlighted = chalk.hex(COLORS.codeText)(code);
  }

  return "\n" + highlighted + "\n";
}
```

- [ ] **Step 2: Fix MessageList.tsx — scroll indicator, theme, pass width to markdown**

Replace `src/interfaces/cli/tui/MessageList.tsx`:

```tsx
import { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { RueSpinner } from "./RueSpinner.js";
import { renderMarkdown } from "./markdown.js";
import { COLORS } from "./theme.js";
import type { ChatMessage } from "./App.js";

interface MessageListProps {
  messages: ChatMessage[];
  height: number;
  width: number;
  isLoading: boolean;
}

export function MessageList({ messages, height, width, isLoading }: MessageListProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const renderedLines = useMemo(() => {
    if (messages.length === 0) return [];
    const lines: string[] = [];
    for (const msg of messages) {
      lines.push(...renderMessage(msg, width));
    }
    if (isLoading && !messages.some(m => m.isStreaming && m.content)) {
      lines.push("");
      lines.push(`  \x1b[38;2;168;144;128m\u280B thinking...\x1b[0m`);
    }
    return lines;
  }, [messages, width, isLoading]);

  const displayHeight = height - 1;
  useEffect(() => {
    const maxOffset = Math.max(0, renderedLines.length - displayHeight);
    setScrollOffset(maxOffset);
  }, [renderedLines.length, displayHeight]);

  useInput((_input, key) => {
    const maxOffset = Math.max(0, renderedLines.length - displayHeight);
    if (key.upArrow || (key.ctrl && _input === "u")) {
      setScrollOffset((prev) => Math.max(0, prev - (key.ctrl ? Math.floor(displayHeight / 2) : 1)));
    }
    if (key.downArrow || (key.ctrl && _input === "d")) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + (key.ctrl ? Math.floor(displayHeight / 2) : 1)));
    }
    if (key.pageUp) {
      setScrollOffset((prev) => Math.max(0, prev - displayHeight));
    }
    if (key.pageDown) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + displayHeight));
    }
  });

  if (messages.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" height={height} width={width}>
        <Text color={COLORS.dimmed}>Type a message to start, or /help for commands</Text>
      </Box>
    );
  }

  const atBottom = scrollOffset >= renderedLines.length - displayHeight;
  const canScroll = renderedLines.length > displayHeight;

  const visibleForDisplay = renderedLines.slice(scrollOffset, scrollOffset + displayHeight);

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      <Box flexDirection="column" paddingX={1} height={displayHeight}>
        {visibleForDisplay.map((line, i) => (
          <Text key={scrollOffset + i} wrap="truncate">{line}</Text>
        ))}
      </Box>
      {/* Issue #10: Use a simple last-line indicator instead of position="absolute" */}
      {canScroll && !atBottom && (
        <Box justifyContent="flex-end" paddingRight={2}>
          <Text color={COLORS.veryDim}>\u2193 more</Text>
        </Box>
      )}
    </Box>
  );
}

function wrapLine(line: string, maxWidth: number, indent: string): string[] {
  const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
  if (visible.length <= maxWidth) return [line];

  const words = visible.split(" ");
  const wrapped: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      wrapped.push(current);
      current = indent + word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) wrapped.push(current);
  return wrapped.length > 0 ? wrapped : [line];
}

function renderMessage(msg: ChatMessage, _width: number): string[] {
  const lines: string[] = [];
  const time = formatTime(msg.timestamp);
  const reset = "\x1b[0m";
  const divider = `\x1b[38;2;58;53;48m${"\u2500".repeat(_width)}${reset}`;
  const contentWidth = _width - 6;

  switch (msg.role) {
    case "user":
      lines.push(divider);
      lines.push(`  \x1b[1;38;2;122;162;212m> you${reset} \x1b[38;2;107;101;96m${time}${reset}`);
      for (const line of msg.content.split("\n")) {
        for (const wrapped of wrapLine(`    ${line}`, contentWidth, "    ")) {
          lines.push(wrapped);
        }
      }
      break;

    case "assistant": {
      lines.push(divider);
      const thinking = msg.isStreaming && !msg.content;
      lines.push(`  \x1b[1;38;2;232;184;122m> rue${reset} \x1b[38;2;107;101;96m${time}${reset}${thinking ? " \x1b[38;2;232;184;122m\u280B\x1b[0m" : ""}`);
      if (msg.content) {
        // Issue #9: Pass actual terminal width to markdown renderer
        const rendered = renderMarkdown(msg.content, contentWidth);
        for (const line of rendered.split("\n")) {
          for (const wrapped of wrapLine(`    ${line}`, contentWidth, "    ")) {
            lines.push(wrapped);
          }
        }
      }
      break;
    }

    case "system":
      lines.push("");
      for (const wrapped of wrapLine(`  \x1b[3;38;2;107;101;96m~ ${msg.content}\x1b[0m`, contentWidth, "    ")) {
        lines.push(wrapped);
      }
      break;
  }

  return lines;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/interfaces/cli/tui/MessageList.tsx src/interfaces/cli/tui/markdown.ts
git commit -m "fix: dynamic markdown width, scroll indicator without position=absolute, use theme"
```

---

### Task 8: Fix remaining components — InputBar, StatusBar, RueSpinner (theme)

**Files:**
- Modify: `src/interfaces/cli/tui/InputBar.tsx`
- Modify: `src/interfaces/cli/tui/StatusBar.tsx`
- Modify: `src/interfaces/cli/tui/RueSpinner.tsx`

Fixes issue #8 (hardcoded colors).

- [ ] **Step 1: Update InputBar.tsx**

Replace `src/interfaces/cli/tui/InputBar.tsx`:

```tsx
import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { COLORS } from "./theme.js";

interface InputBarProps {
  onSubmit: (text: string) => void;
  isLoading: boolean;
}

export function InputBar({ onSubmit, isLoading }: InputBarProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (text: string) => {
    if (!text.trim()) return;
    onSubmit(text);
    setValue("");
  };

  const borderColor = isLoading ? COLORS.secondary : COLORS.primary;

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      marginX={1}
    >
      <Text color={borderColor} bold>{">"} </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={isLoading ? "waiting for response..." : "message rue..."}
      />
    </Box>
  );
}
```

- [ ] **Step 2: Update StatusBar.tsx — add connectionState prop**

Replace `src/interfaces/cli/tui/StatusBar.tsx`:

```tsx
import { Box, Text } from "ink";
import { COLORS } from "./theme.js";

interface StatusBarProps {
  agentCount: number;
  isLoading: boolean;
  totalCost: number;
  width: number;
  connectionState: "connected" | "reconnecting" | "disconnected";
}

export function StatusBar({ agentCount, isLoading, totalCost, width, connectionState }: StatusBarProps) {
  return (
    <Box paddingX={2} justifyContent="space-between" width={width}>
      <Box>
        <Text color={COLORS.primary} bold>rue</Text>
        <Text color={COLORS.dimmed}> v0.1.0</Text>
        <Text color={COLORS.veryDim}> | </Text>
        {connectionState === "reconnecting" ? (
          <Text color={COLORS.secondary}>reconnecting</Text>
        ) : connectionState === "disconnected" ? (
          <Text color={COLORS.urgent}>disconnected</Text>
        ) : isLoading ? (
          <Text color={COLORS.secondary}>working</Text>
        ) : (
          <Text color={COLORS.success}>ready</Text>
        )}
      </Box>

      <Box>
        {agentCount > 0 && (
          <>
            <Text color={COLORS.secondary}>{agentCount} agent{agentCount !== 1 ? "s" : ""}</Text>
            <Text color={COLORS.veryDim}> | </Text>
          </>
        )}
        {totalCost > 0 && (
          <>
            <Text color={COLORS.dimmed}>${totalCost.toFixed(2)}</Text>
            <Text color={COLORS.veryDim}> | </Text>
          </>
        )}
        <Text color={COLORS.dimmed}>/help</Text>
        <Text color={COLORS.veryDim}> | </Text>
        <Text color={COLORS.dimmed}>ctrl+c</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Update RueSpinner.tsx**

Replace `src/interfaces/cli/tui/RueSpinner.tsx`:

```tsx
import { useState, useEffect } from "react";
import { Text } from "ink";
import { COLORS } from "./theme.js";

const INLINE_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

const BLOCK_FRAMES = [
  "   \u25CF    ",
  "  \u25CF \u25CF   ",
  " \u25CF   \u25CF  ",
  "\u25CF     \u25CF ",
  " \u25CF   \u25CF  ",
  "  \u25CF \u25CF   ",
];

interface RueSpinnerProps {
  mode?: "inline" | "block";
}

export function RueSpinner({ mode = "inline" }: RueSpinnerProps) {
  const [frame, setFrame] = useState(0);
  const frames = mode === "block" ? BLOCK_FRAMES : INLINE_FRAMES;
  const interval = mode === "block" ? 200 : 80;

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, interval);
    return () => clearInterval(timer);
  }, [frames.length, interval]);

  return <Text color={COLORS.primary}>{frames[frame]}</Text>;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/interfaces/cli/tui/InputBar.tsx src/interfaces/cli/tui/StatusBar.tsx src/interfaces/cli/tui/RueSpinner.tsx
git commit -m "fix: use theme constants in InputBar, StatusBar, RueSpinner"
```

---

### Task 9: Run all existing tests and verify no regressions

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All existing tests pass, new tests pass

- [ ] **Step 2: Fix any failures**

If there are import path issues or type errors, fix them.

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve test and type regressions from TUI fixes"
```

---

## Issue Coverage Matrix

| # | Issue | Fixed In |
|---|-------|----------|
| 1 | No WS reconnection | Task 2 (client.ts — setupWs/scheduleReconnect) |
| 2 | Pending requests never timeout | Task 2 (client.ts — sendCmd timer) |
| 3 | Event subscriptions leak on remount | Task 5 (App.tsx — useEffect returns unsub) |
| 4 | activeStreamId race condition | Task 2 (client.ts — only clear if still owner) |
| 5 | Agent cleanup timers untracked | Task 5 (App.tsx — agentTimersRef) |
| 6 | Blank splash → loading animation | Task 4 + Task 5 (LoadingScreen.tsx + initialLoading state) |
| 7 | Sidebar panel heights fragile | Task 6 (Sidebar.tsx — clamp eventPanelHeight) |
| 8 | ANSI codes hardcoded | Task 1 + Tasks 6-8 (theme.ts used everywhere) |
| 9 | Markdown width hardcoded to 100 | Task 7 (markdown.ts — dynamic width param) |
| 10 | Scroll indicator broken | Task 7 (MessageList.tsx — justifyContent instead of position=absolute) |
| 11 | No "X more" indicators | Task 6 (Sidebar.tsx — overflow counts) |
| 12 | Magic numbers everywhere | Task 1 + all tasks (LAYOUT constants) |
| 13 | 3s task poll redundant | Task 5 (App.tsx — kept as fallback, events trigger immediate) |
| 14 | Usage graph not memoized | Task 6 (Sidebar.tsx — useMemo) |
| 15 | Token estimation inaccurate | Task 5 (App.tsx — 3.5 chars/token via LAYOUT) |
| 16 | No error boundary | Task 3 (ErrorBoundary.tsx wrapping App) |
| 17 | No keep-alive ping | Task 2 (client.ts — startPing/stopPing) |
| 18 | No request timeout | Task 2 (client.ts — sendCmd timer) |
| + | Loading animation instead of splash | Task 4 + Task 5 (LoadingScreen + initialLoading) |
