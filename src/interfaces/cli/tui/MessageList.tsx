import { useMemo } from "react";
import { Box, Text } from "ink";
import { RueSpinner } from "./RueSpinner.js";
import type { ChatMessage } from "./App.js";

interface MessageListProps {
  messages: ChatMessage[];
  height: number;
  width: number;
  isLoading: boolean;
}

export function MessageList({ messages, height, width, isLoading }: MessageListProps) {
  // Show last N messages that fit in the viewport
  const visibleMessages = useMemo(() => {
    if (messages.length === 0) return [];
    // Rough estimate: each message takes ~3-4 lines
    const maxMessages = Math.floor(height / 3);
    return messages.slice(-maxMessages);
  }, [messages, height]);

  if (messages.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" height={height} width={width}>
        <RueSpinner mode="block" />
        <Box marginTop={1}>
          <Text color="cyan" bold>rue</Text>
          <Text dimColor> v0.1.0</Text>
        </Box>
        <Text dimColor>Type a message to start, or /help for commands</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} overflow="hidden">
      {visibleMessages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} width={width} />
      ))}
      {isLoading && !messages.some(m => m.isStreaming && m.content) && (
        <Box marginTop={1} paddingLeft={1}>
          <RueSpinner mode="inline" />
          <Text dimColor> thinking...</Text>
        </Box>
      )}
    </Box>
  );
}

function MessageBubble({ message, width }: { message: ChatMessage; width: number }) {
  switch (message.role) {
    case "user": return <UserMessage message={message} />;
    case "assistant": return <AssistantMessage message={message} width={width} />;
    case "system": return <SystemMessage message={message} />;
    default: return null;
  }
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold color="blue">{'>'} you </Text>
        <Text dimColor>{formatTime(message.timestamp)}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text>{message.content}</Text>
      </Box>
    </Box>
  );
}

function AssistantMessage({ message, width }: { message: ChatMessage; width: number }) {
  const isThinking = message.isStreaming && !message.content;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold color="green">{'>'} rue </Text>
        <Text dimColor>{formatTime(message.timestamp)}</Text>
        {isThinking && (
          <Box marginLeft={1}>
            <RueSpinner mode="inline" />
          </Box>
        )}
      </Box>
      {message.content ? (
        <Box paddingLeft={2} width={Math.min(width - 6, 120)}>
          <Text wrap="wrap">{message.content}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <Box marginTop={1} paddingLeft={2}>
      <Text dimColor italic>~ {message.content}</Text>
    </Box>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
