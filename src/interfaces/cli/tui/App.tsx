import { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { MessageList } from "./MessageList.js";
import { InputBar } from "./InputBar.js";
import { AgentPanel } from "./AgentPanel.js";
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agents, setAgents] = useState<Map<string, AgentActivity>>(new Map());

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      client.disconnect();
      exit();
    }
  });

  // Load message history on startup
  useEffect(() => {
    client.history(15).then((result) => {
      const restored: ChatMessage[] = result.messages
        .filter((m) => m.role !== "agent-event")
        .map((m) => ({
          id: m.id,
          role: m.role as ChatMessage["role"],
          content: m.content,
          timestamp: m.timestamp,
        }));
      if (restored.length > 0) {
        setMessages(restored);
      }
    }).catch(() => {});
  }, [client]);

  // Subscribe to agent events
  useEffect(() => {
    client.subscribe(["agent:*"]);

    const unsub = client.onEvent((channel, payload) => {
      const data = payload as Record<string, unknown>;

      switch (channel) {
        case "agent:spawned": {
          setAgents((prev) => new Map(prev).set(data.id as string, {
            id: data.id as string,
            task: data.task as string,
            state: "spawned",
            startedAt: Date.now(),
            lane: data.lane as string,
          }));
          break;
        }
        case "agent:completed":
        case "agent:failed":
        case "agent:killed": {
          const id = data.id as string;
          const state = channel.split(":")[1] as AgentActivity["state"];
          setAgents((prev) => {
            const next = new Map(prev);
            const existing = next.get(id);
            if (existing) {
              next.set(id, { ...existing, state });
              // Remove completed/failed/killed agents after a short delay
              setTimeout(() => {
                setAgents((p) => {
                  const n = new Map(p);
                  n.delete(id);
                  return n;
                });
              }, 5000);
            }
            return next;
          });
          break;
        }
      }
    });

    return unsub;
  }, [client]);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Handle slash commands
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
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + chunk }
                  : m,
              ),
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
    },
    [client, isLoading, agents],
  );

  const activeAgents = Array.from(agents.values());

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header />
      <Box flexDirection="column" flexGrow={1}>
        <MessageList messages={messages} />
      </Box>
      {activeAgents.length > 0 && <AgentPanel agents={activeAgents} />}
      <InputBar onSubmit={handleSubmit} isLoading={isLoading} />
    </Box>
  );
}

async function handleSlashCommand(
  text: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  _client: DaemonClient,
  agents: Map<string, AgentActivity>,
) {
  const cmd = text.slice(1).trim().toLowerCase();

  switch (cmd) {
    case "agents": {
      const agentList = Array.from(agents.values());
      if (agentList.length === 0) {
        setMessages((prev) => [...prev, {
          id: `sys-${Date.now()}`,
          role: "system",
          content: "No agents currently running.",
          timestamp: Date.now(),
        }]);
      } else {
        const lines = agentList.map((a) => {
          const elapsed = formatElapsed(Date.now() - a.startedAt);
          const icon = a.state === "spawned" || a.state === "running" ? ">" : a.state === "completed" ? "+" : "x";
          return `  ${icon} ${a.id.slice(0, 20)} | ${a.state} | ${a.lane} | ${elapsed}\n    ${a.task}`;
        });
        setMessages((prev) => [...prev, {
          id: `sys-${Date.now()}`,
          role: "system",
          content: `Active agents:\n${lines.join("\n")}`,
          timestamp: Date.now(),
        }]);
      }
      break;
    }
    case "clear": {
      setMessages([]);
      break;
    }
    case "help": {
      setMessages((prev) => [...prev, {
        id: `sys-${Date.now()}`,
        role: "system",
        content: "Commands: /agents — list agents | /clear — clear chat | /help — this message",
        timestamp: Date.now(),
      }]);
      break;
    }
    default: {
      setMessages((prev) => [...prev, {
        id: `sys-${Date.now()}`,
        role: "system",
        content: `Unknown command: /${cmd}. Type /help for available commands.`,
        timestamp: Date.now(),
      }]);
    }
  }
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m${remaining}s`;
}

function Header() {
  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="center">
      <Text bold color="cyan">rue</Text>
      <Text color="gray"> v0.1.0 </Text>
      <Text dimColor>| /help for commands</Text>
    </Box>
  );
}
