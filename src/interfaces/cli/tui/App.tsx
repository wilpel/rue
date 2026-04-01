import { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { MessageList } from "./MessageList.js";
import { InputBar } from "./InputBar.js";
import { StatusBar } from "./StatusBar.js";
import { Sidebar, type EventEntry, type TaskInfo } from "./Sidebar.js";
import { DaemonClient } from "../client.js";

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
  const [usageHistory, setUsageHistory] = useState<Array<{ cost: number; timestamp: number }>>([]);
  const [costSinceLastSample, setCostSinceLastSample] = useState(0);

  // Sample usage every 5 seconds — adds a new bar to the graph
  useEffect(() => {
    const timer = setInterval(() => {
      setCostSinceLastSample((current) => {
        setUsageHistory((prev) => [...prev.slice(-100), { cost: current, timestamp: Date.now() }]);
        return 0;
      });
    }, 5000);
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
          timestamp: m.timestamp,
        }));
      if (restored.length > 0) setMessages(restored);
    }).catch(() => {});
  }, [client]);

  // Poll for active tasks + refresh on task events
  const fetchTasks = useCallback(() => {
    client.tasks().then(result => setTasks(result.tasks ?? [])).catch(() => {});
  }, [client]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 1_000);
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
    return unsub;
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
          summary = `❓ ${data.question as string ?? ""}`;
        } else if (channel === "delegate:answer") {
          summary = `💬 ${data.answer as string ?? ""}`;
        } else {
          summary = data.task as string ?? data.result as string ?? data.error as string ?? data.reason as string ?? data.output as string ?? "";
        }
        setEvents((prev) => [...prev.slice(-50), { channel, summary, timestamp: Date.now() }]);
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
            const cost = data.cost as number;
            setTotalCost((prev) => prev + cost);
            setCostSinceLastSample((prev) => prev + cost);
          }
          setAgents((prev) => {
            const next = new Map(prev);
            const existing = next.get(id);
            if (existing) next.set(id, { ...existing, state: "completed" });
            setTimeout(() => setAgents((p) => { const n = new Map(p); n.delete(id); return n; }), 3000);
            return next;
          });
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
            setTimeout(() => setAgents((p) => { const n = new Map(p); n.delete(id); return n; }), 5000);
            return next;
          });
          break;
        }
      }
    });

    return unsub;
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
  // Layout: top bar (1) + spacer (1) + input (3) + status (1) = 6, rest is messages + sidebar
  const chromeHeight = 6;
  const contentHeight = Math.max(8, termHeight - chromeHeight);
  // Sidebar takes ~30% of width, min 28 chars, only if terminal is wide enough
  const showSidebar = termWidth >= 90;
  const sidebarWidth = showSidebar ? Math.max(28, Math.floor(termWidth * 0.3)) : 0;
  const messageWidth = termWidth - sidebarWidth;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Top bar */}
      <Box paddingX={2} justifyContent="space-between" width={termWidth}>
        <Box>
          <Text color="#E8B87A" bold> .-.  </Text>
          <Text color="#E8B87A" bold>rue</Text>
          <Text color="#4A3F35"> | </Text>
          <Text color="#6B6560">your ai daemon</Text>
        </Box>
        <Box>
          <Text color="#6B6560">v0.1.0</Text>
        </Box>
      </Box>

      {/* Main content area — split pane */}
      <Box flexDirection="row" height={contentHeight}>
        {/* Left: message area */}
        <Box flexDirection="column" width={messageWidth} height={contentHeight} overflow="hidden">
          <MessageList messages={messages} height={contentHeight} width={messageWidth} isLoading={isLoading} />
        </Box>

        {/* Right: sidebar with agents + events */}
        {showSidebar && (
          <Sidebar
            agents={activeAgents}
            tasks={tasks}
            events={events}
            usageHistory={usageHistory}
            totalCost={totalCost}
            height={contentHeight}
            width={sidebarWidth}
          />
        )}
      </Box>

      {/* Input bar */}
      <InputBar onSubmit={handleSubmit} isLoading={isLoading} />

      {/* Status bar — bottom of screen */}
      <StatusBar
        agentCount={activeAgents.filter(a => a.state === "spawned" || a.state === "running").length}
        isLoading={isLoading}
        totalCost={totalCost}
        width={termWidth}
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
