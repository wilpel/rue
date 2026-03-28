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
    <Box flexDirection="column" marginY={0} paddingLeft={1} borderStyle="single" borderColor="blue" borderLeft borderRight={false} borderTop={false} borderBottom={false}>
      <Box>
        <Text bold color="blue">you </Text>
        <Text dimColor>{formatTime(message.timestamp)}</Text>
      </Box>
      <Text>{message.content}</Text>
    </Box>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <Box flexDirection="column" marginY={0} paddingLeft={1} borderStyle="single" borderColor="green" borderLeft borderRight={false} borderTop={false} borderBottom={false}>
      <Box>
        <Text bold color="green">rue </Text>
        <Text dimColor>{formatTime(message.timestamp)}</Text>
        {message.cost !== undefined && (
          <Text dimColor> ${message.cost.toFixed(4)}</Text>
        )}
        {message.isStreaming && (
          <Box marginLeft={1}>
            <Spinner type="dots" />
          </Box>
        )}
      </Box>
      <Text>{message.content || (message.isStreaming ? "" : "(empty response)")}</Text>
    </Box>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <Box marginY={0} paddingX={1}>
      <Text dimColor italic>
        {message.content}
      </Text>
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
