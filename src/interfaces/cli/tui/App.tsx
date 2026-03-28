import { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { MessageList } from "./MessageList.js";
import { InputBar } from "./InputBar.js";
import { StatusBar } from "./StatusBar.js";
import { DaemonClient } from "../client.js";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  cost?: number;
  isStreaming?: boolean;
}

interface AppProps {
  client: DaemonClient;
}

export function App({ client }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      content: "Connected to Rue daemon. Type a message to begin.",
      timestamp: Date.now(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [agentCount, setAgentCount] = useState(0);

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      client.disconnect();
      exit();
    }
  });

  // Poll agent count periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const status = await client.status();
        setAgentCount((status.agents as unknown[]).length);
      } catch {
        // ignore — daemon might be busy
      }
    }, 3000);
    return () => clearInterval(interval);
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

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              cost: result.cost,
            };
          }
          return updated;
        });

        setTotalCost((prev) => prev + result.cost);
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

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header />
      <Box flexDirection="column" flexGrow={1}>
        <MessageList messages={messages} />
      </Box>
      <InputBar onSubmit={handleSubmit} isLoading={isLoading} />
      <StatusBar
        totalCost={totalCost}
        agentCount={agentCount}
        isLoading={isLoading}
      />
    </Box>
  );
}

function Header() {
  return (
    <Box
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      justifyContent="center"
    >
      <Text bold color="cyan">
        rue
      </Text>
      <Text color="gray"> v0.1.0 </Text>
      <Text dimColor>| Ctrl+C to quit</Text>
    </Box>
  );
}
