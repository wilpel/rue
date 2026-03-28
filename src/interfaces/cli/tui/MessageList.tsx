import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { ChatMessage } from "./App.js";

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </Box>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  switch (message.role) {
    case "user":
      return <UserMessage message={message} />;
    case "assistant":
      return <AssistantMessage message={message} />;
    case "system":
      return <SystemMessage message={message} />;
    default:
      return null;
  }
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1} borderStyle="single" borderColor="blue" borderLeft borderRight={false} borderTop={false} borderBottom={false}>
      <Box>
        <Text bold color="blue">you </Text>
        <Text dimColor>{formatTime(message.timestamp)}</Text>
      </Box>
      <Text>{message.content}</Text>
    </Box>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const showSpinner = message.isStreaming && !message.content;
  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1} borderStyle="single" borderColor="green" borderLeft borderRight={false} borderTop={false} borderBottom={false}>
      <Box>
        <Text bold color="green">rue </Text>
        <Text dimColor>{formatTime(message.timestamp)}</Text>
        {showSpinner && (
          <Box marginLeft={1}>
            <Spinner type="dots" />
          </Box>
        )}
      </Box>
      {message.content ? <Text>{message.content}</Text> : null}
    </Box>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <Box marginTop={1} paddingX={1}>
      <Text dimColor italic>{message.content}</Text>
    </Box>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
