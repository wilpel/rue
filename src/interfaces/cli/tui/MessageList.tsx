import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { ChatMessage, AgentActivity } from "./App.js";

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
    case "agent-event":
      return message.agentActivity ? (
        <AgentEventMessage activity={message.agentActivity} />
      ) : null;
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
  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1} borderStyle="single" borderColor="green" borderLeft borderRight={false} borderTop={false} borderBottom={false}>
      <Box>
        <Text bold color="green">rue </Text>
        <Text dimColor>{formatTime(message.timestamp)}</Text>
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

function AgentEventMessage({ activity }: { activity: AgentActivity }) {
  const elapsed = formatElapsed(Date.now() - activity.startedAt);
  const stateIcon = getStateIcon(activity.state);
  const stateColor = getStateColor(activity.state);

  return (
    <Box marginTop={1} paddingLeft={2}>
      <Box flexDirection="column">
        <Box>
          <Text color={stateColor}>{stateIcon} </Text>
          <Text bold color={stateColor}>agent</Text>
          <Text dimColor> {activity.id.slice(0, 16)}</Text>
          <Text dimColor> | {activity.lane}</Text>
          <Text dimColor> | {elapsed}</Text>
          {activity.state === "spawned" && (
            <Box marginLeft={1}>
              <Spinner type="dots" />
            </Box>
          )}
        </Box>
        <Box paddingLeft={2}>
          <Text color="gray">{activity.task}</Text>
        </Box>
      </Box>
    </Box>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <Box marginY={0} paddingX={1}>
      <Text dimColor italic>{message.content}</Text>
    </Box>
  );
}

function getStateIcon(state: AgentActivity["state"]): string {
  switch (state) {
    case "spawned": return ">";
    case "running": return ">";
    case "completed": return "+";
    case "failed": return "x";
    case "killed": return "-";
  }
}

function getStateColor(state: AgentActivity["state"]): string {
  switch (state) {
    case "spawned": return "yellow";
    case "running": return "yellow";
    case "completed": return "green";
    case "failed": return "red";
    case "killed": return "gray";
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m${remaining}s`;
}
