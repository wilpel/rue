import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { AgentActivity } from "./App.js";

interface AgentPanelProps {
  agents: AgentActivity[];
}

export function AgentPanel({ agents }: AgentPanelProps) {
  if (agents.length === 0) return null;

  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="yellow" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
      {agents.map((agent) => (
        <AgentRow key={agent.id} agent={agent} />
      ))}
    </Box>
  );
}

function AgentRow({ agent }: { agent: AgentActivity }) {
  const isActive = agent.state === "spawned" || agent.state === "running";
  const elapsed = formatElapsed(Date.now() - agent.startedAt);
  const color = isActive ? "yellow" : agent.state === "completed" ? "green" : "red";
  const icon = isActive ? "" : agent.state === "completed" ? "+" : "x";

  return (
    <Box>
      {isActive ? (
        <Box>
          <Spinner type="dots" />
          <Text> </Text>
        </Box>
      ) : (
        <Text color={color}>{icon} </Text>
      )}
      <Text color={color} bold>agent </Text>
      <Text dimColor>{agent.task.length > 60 ? agent.task.slice(0, 57) + "..." : agent.task}</Text>
      <Text dimColor> | {elapsed}</Text>
    </Box>
  );
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m${remaining}s`;
}
