import { useMemo } from "react";
import { Box, Text, Transform } from "ink";
import { RueSpinner } from "./RueSpinner.js";
import { renderMarkdown } from "./markdown.js";
import type { ChatMessage } from "./App.js";

interface MessageListProps {
  messages: ChatMessage[];
  height: number;
  width: number;
  isLoading: boolean;
}

export function MessageList({ messages, height, width, isLoading }: MessageListProps) {
  const visibleMessages = useMemo(() => {
    if (messages.length === 0) return [];
    const maxMessages = Math.floor(height / 3);
    return messages.slice(-maxMessages);
  }, [messages, height]);

  if (messages.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" height={height} width={width}>
        <RueSpinner mode="block" />
        <Box marginTop={1}>
          <Text color="#E8B87A" bold>rue</Text>
          <Text color="#A89080"> v0.1.0</Text>
        </Box>
        <Text color="#A89080">Type a message to start, or /help for commands</Text>
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
          <Text color="#A89080"> thinking...</Text>
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
        <Text bold color="#7AA2D4">{">"} you </Text>
        <Text color="#6B6560">{formatTime(message.timestamp)}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text>{message.content}</Text>
      </Box>
    </Box>
  );
}

function AssistantMessage({ message, width }: { message: ChatMessage; width: number }) {
  const isThinking = message.isStreaming && !message.content;

  const rendered = useMemo(() => {
    if (!message.content) return "";
    return renderMarkdown(message.content);
  }, [message.content]);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold color="#E8B87A">{">"} rue </Text>
        <Text color="#6B6560">{formatTime(message.timestamp)}</Text>
        {isThinking && (
          <Box marginLeft={1}>
            <RueSpinner mode="inline" />
          </Box>
        )}
      </Box>
      {rendered ? (
        <Box paddingLeft={2} width={Math.min(width - 6, 120)}>
          <Transform transform={(output) => output}>
            <Text>{rendered}</Text>
          </Transform>
        </Box>
      ) : null}
    </Box>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <Box marginTop={1} paddingLeft={2}>
      <Text color="#6B6560" italic>~ {message.content}</Text>
    </Box>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
