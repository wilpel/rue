import { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { MessageList } from "./MessageList.js";
import { InputBar } from "./InputBar.js";
import { StatusBar } from "./StatusBar.js";
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
  role: "user" | "assistant" | "system" | "agent-event";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  agentActivity?: AgentActivity;
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

  // Subscribe to agent events from the daemon
  useEffect(() => {
    client.subscribe(["agent:*", "task:*"]);

    const unsub = client.onEvent((channel, payload) => {
      const data = payload as Record<string, unknown>;

      switch (channel) {
        case "agent:spawned": {
          const activity: AgentActivity = {
            id: data.id as string,
            task: data.task as string,
            state: "spawned",
            startedAt: Date.now(),
            lane: data.lane as string,
          };
          setAgents((prev) => new Map(prev).set(activity.id, activity));
          setMessages((prev) => [
            ...prev,
            {
              id: `event-${Date.now()}-spawned`,
              role: "agent-event",
              content: "",
              timestamp: Date.now(),
              agentActivity: activity,
            },
          ]);
          break;
        }
        case "agent:completed": {
          const id = data.id as string;
          setAgents((prev) => {
            const next = new Map(prev);
            const existing = next.get(id);
            if (existing) {
              next.set(id, { ...existing, state: "completed" });
            }
            return next;
          });
          // Update the event message
          setMessages((prev) =>
            prev.map((m) =>
              m.agentActivity?.id === id
                ? { ...m, agentActivity: { ...m.agentActivity, state: "completed" as const } }
                : m,
            ),
          );
          break;
        }
        case "agent:failed": {
          const id = data.id as string;
          setAgents((prev) => {
            const next = new Map(prev);
            const existing = next.get(id);
            if (existing) {
              next.set(id, { ...existing, state: "failed" });
            }
            return next;
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.agentActivity?.id === id
                ? { ...m, agentActivity: { ...m.agentActivity, state: "failed" as const } }
                : m,
            ),
          );
          break;
        }
        case "agent:killed": {
          const id = data.id as string;
          setAgents((prev) => {
            const next = new Map(prev);
            const existing = next.get(id);
            if (existing) {
              next.set(id, { ...existing, state: "killed" });
            }
            return next;
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.agentActivity?.id === id
                ? { ...m, agentActivity: { ...m.agentActivity, state: "killed" as const } }
                : m,
            ),
          );
          break;
        }
      }
    });

    return unsub;
  }, [client]);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
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
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + chunk,
                };
              }
              return updated;
            });
          },
        });

        // Finalize: use result.output as fallback if streaming didn't deliver
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: last.content || result.output || "(no response)",
              isStreaming: false,
            };
          }
          return updated;
        });
      } catch (err) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: `Error: ${err instanceof Error ? err.message : String(err)}`,
              isStreaming: false,
            };
          }
          return updated;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [client, isLoading],
  );

  const activeAgents = Array.from(agents.values()).filter(
    (a) => a.state === "spawned" || a.state === "running",
  );

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header />
      <Box flexDirection="column" flexGrow={1}>
        <MessageList messages={messages} />
      </Box>
      <InputBar onSubmit={handleSubmit} isLoading={isLoading} />
      <StatusBar agentCount={activeAgents.length} isLoading={isLoading} />
    </Box>
  );
}

function Header() {
  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="center">
      <Text bold color="cyan">rue</Text>
      <Text color="gray"> v0.1.0 </Text>
      <Text dimColor>| ctrl+c to quit</Text>
    </Box>
  );
}
