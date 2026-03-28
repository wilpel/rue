import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { ChatMessage, AgentActivity } from "./App.js";

function ElapsedTime({ startedAt }: { startedAt: number }) {
  const elapsed = formatElapsed(Date.now() - startedAt);
  return <Text dimColor>{elapsed}</Text>;
}

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

function AgentEventMessage({ activity }: { activity: AgentActivity }) {
  const stateIcon = getStateIcon(activity.state);
  const stateColor = getStateColor(activity.state);
  const isActive = activity.state === "spawned" || activity.state === "running";

  return (
    <Box marginTop={1} paddingLeft={2}>
      <Box flexDirection="column">
        <Box>
          <Text color={stateColor}>{stateIcon} </Text>
          <Text bold color={stateColor}>agent </Text>
          <Text dimColor>{activity.task}</Text>
          {isActive && (
            <Box marginLeft={1}>
              <Spinner type="dots" />
              <Text dimColor> </Text>
              <ElapsedTime startedAt={activity.startedAt} />
            </Box>
          )}
          {!isActive && (
            <Box marginLeft={1}>
              <ElapsedTime startedAt={activity.startedAt} />
            </Box>
          )}
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
