import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { ChatPanel } from "./ChatPanel.js";
import { RightPanels, type EventEntry, type TaskInfo } from "./RightPanels.js";
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
  const [, setUsageHistory] = useState<Array<{ tokens: number; timestamp: number }>>([]);
  const [, setTokensSinceLastSample] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [connectionState, setConnectionState] = useState<"connected" | "reconnecting" | "disconnected">("connected");

  const agentTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Clean up agent timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of agentTimersRef.current.values()) clearTimeout(timer);
      agentTimersRef.current.clear();
    };
  }, []);

  // Track connection state
  useEffect(() => {
    const unsubReconnecting = client.onReconnecting(() => setConnectionState("reconnecting"));
    const unsubReconnected = client.onReconnected(() => setConnectionState("connected"));
    const unsubDisconnected = client.onDisconnected(() => setConnectionState("disconnected"));
    return () => { unsubReconnecting(); unsubReconnected(); unsubDisconnected(); };
  }, [client]);

  // Sample token usage — adds a new bar to the graph
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

  // Load message history on startup
  useEffect(() => {
    client.history(20).then((result) => {
      const restored: ChatMessage[] = result.messages
        .filter((m) => m.role !== "agent-event")
        .map((m) => ({
          id: m.id,
          role: m.role as ChatMessage["role"],
          content: m.content,
          timestamp: m.timestamp ?? (m as Record<string, unknown>).createdAt as number ?? Date.now(),
        }));
      if (restored.length > 0) setMessages(restored);
    }).catch(() => {});
  }, [client]);

  // Poll for active tasks + refresh on task events (skip while streaming)
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

  // Listen for async responses (delegate results, scheduled events, answers)
  useEffect(() => {
    const unsub = client.onNotify((_title, body) => {
      if (body) {
        setMessages((prev) => [...prev, {
          id: `notify-${Date.now()}`,
          role: "assistant",
          content: body,
          timestamp: Date.now(),
        }]);
      }
    });
    return () => { unsub(); };
  }, [client]);

  // Subscribe to agent events
  useEffect(() => {
    client.subscribe(["agent:*", "task:*", "system:*", "delegate:*"]);

    const unsub = client.onEvent((channel, payload) => {
      const data = payload as Record<string, unknown>;

      // Refresh tasks on task events
      if (channel.startsWith("task:")) fetchTasks();

      // Track events for sidebar — skip noisy message/interface events
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
          if (typeof data.cost === "number") {
            setTotalCost((prev) => prev + (data.cost as number));
          }
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

    return () => { unsub(); };
  }, [client]);

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
          // Live estimate ~3.5 chars per token (exact count arrives in agent:completed)
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
  const activeCount = activeAgents.filter(a => a.state === "spawned" || a.state === "running").length;
  // Layout: header (1) + content = termHeight - 1
  const contentHeight = Math.max(LAYOUT.minContentHeight, termHeight - 1);
  const showPanels = termWidth >= 80;
  const panelWidth = showPanels ? Math.max(28, Math.floor(termWidth * 0.28)) : 0;
  const chatWidth = termWidth - panelWidth;

  // Status label
  const statusLabel = connectionState === "reconnecting" ? "reconnecting"
    : connectionState === "disconnected" ? "disconnected"
    : isLoading ? "working" : "ready";
  const statusColor = connectionState === "reconnecting" ? COLORS.secondary
    : connectionState === "disconnected" ? COLORS.urgent
    : isLoading ? COLORS.secondary : COLORS.success;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Header — everything at a glance */}
      <Box paddingX={1} justifyContent="space-between" width={termWidth}>
        <Box>
          <Text color={COLORS.primary} bold>rue</Text>
          <Text color={COLORS.border}> │ </Text>
          <Text color={statusColor}>{statusLabel}</Text>
          {activeCount > 0 && (
            <>
              <Text color={COLORS.border}> │ </Text>
              <Text color={COLORS.success}>{activeCount} agent{activeCount !== 1 ? "s" : ""}</Text>
            </>
          )}
          {totalCost > 0 && (
            <>
              <Text color={COLORS.border}> │ </Text>
              <Text color={COLORS.veryDim}>${totalCost.toFixed(2)}</Text>
            </>
          )}
        </Box>
        <Text color={COLORS.veryDim}>/help  ctrl+c</Text>
      </Box>

      {/* Main area: chat (with integrated input) + side panels */}
      <Box flexDirection="row" height={contentHeight}>
        <ChatPanel
          messages={messages}
          height={contentHeight}
          width={chatWidth}
          isLoading={isLoading}
          onSubmit={handleSubmit}
        />
        {showPanels && (
          <RightPanels
            agents={activeAgents}
            tasks={tasks}
            events={events}
            totalTokens={totalTokens}
            totalCost={totalCost}
            height={contentHeight}
            width={panelWidth}
            isLoading={isLoading}
          />
        )}
      </Box>
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
