import { Box, Text } from "ink";
import { RueSpinner } from "./RueSpinner.js";
import type { AgentActivity } from "./App.js";

interface SidebarProps {
  agents: AgentActivity[];
  events: EventEntry[];
  height: number;
  width: number;
}

export interface EventEntry {
  channel: string;
  summary: string;
  timestamp: number;
}

export function Sidebar({ agents, events, height, width }: SidebarProps) {
  const agentPanelHeight = Math.max(5, Math.floor(height * 0.4));
  const eventPanelHeight = height - agentPanelHeight;

  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="single" borderColor="#3A3530" borderLeft borderTop={false} borderBottom={false} borderRight={false}>
      <AgentsPanel agents={agents} height={agentPanelHeight} width={width} />
      <EventsPanel events={events} height={eventPanelHeight} width={width} />
    </Box>
  );
}

function AgentsPanel({ agents, height, width }: { agents: AgentActivity[]; height: number; width: number }) {
  const activeAgents = agents.filter(a => a.state === "spawned" || a.state === "running");
  const recentDone = agents.filter(a => a.state === "completed" || a.state === "failed" || a.state === "killed").slice(-3);
  const allVisible = [...activeAgents, ...recentDone].slice(0, height - 2);

  return (
    <Box flexDirection="column" height={height} paddingX={1}>
      <Box>
        <Text color="#E8B87A" bold> Agents </Text>
        {activeAgents.length > 0 && <Text color="#D4956B">({activeAgents.length})</Text>}
      </Box>
      <Box borderStyle="single" borderColor="#3A3530" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text> </Text>
      </Box>
      {allVisible.length === 0 ? (
        <Box paddingLeft={1}>
          <Text color="#4A3F35">no agents</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {allVisible.map((agent) => (
            <SidebarAgentRow key={agent.id} agent={agent} maxWidth={width - 4} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function SidebarAgentRow({ agent, maxWidth }: { agent: AgentActivity; maxWidth: number }) {
  const isActive = agent.state === "spawned" || agent.state === "running";
  const color = isActive ? "#D4956B" : agent.state === "completed" ? "#8BA87A" : "#C47070";
  const icon = isActive ? "" : agent.state === "completed" ? "+" : "x";
  const elapsed = formatElapsed(Date.now() - agent.startedAt);
  const taskLen = Math.max(10, maxWidth - 12);
  const task = agent.task.length > taskLen ? agent.task.slice(0, taskLen - 3) + "..." : agent.task;

  return (
    <Box paddingLeft={1}>
      <Text color={color}>{isActive ? <RueSpinner /> : icon} </Text>
      <Text color="#6B6560">{task} </Text>
      <Text color="#4A3F35">{elapsed}</Text>
    </Box>
  );
}

function EventsPanel({ events, height, width }: { events: EventEntry[]; height: number; width: number }) {
  const visible = events.slice(-(height - 2));

  return (
    <Box flexDirection="column" height={height} paddingX={1}>
      <Box>
        <Text color="#E8B87A" bold> Events </Text>
      </Box>
      <Box borderStyle="single" borderColor="#3A3530" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text> </Text>
      </Box>
      {visible.length === 0 ? (
        <Box paddingLeft={1}>
          <Text color="#4A3F35">no events</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visible.map((evt, i) => (
            <EventRow key={`${evt.timestamp}-${i}`} event={evt} maxWidth={width - 4} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function EventRow({ event, maxWidth }: { event: EventEntry; maxWidth: number }) {
  const time = formatTime(event.timestamp);
  const channelColor = event.channel.startsWith("agent:") ? "#D4956B"
    : event.channel.startsWith("system:") ? "#8BA87A"
    : event.channel.startsWith("task:") ? "#7AA2D4"
    : "#6B6560";
  const tag = event.channel.split(":").pop() ?? event.channel;
  const summaryLen = Math.max(5, maxWidth - tag.length - 8);
  const summary = event.summary.length > summaryLen ? event.summary.slice(0, summaryLen - 3) + "..." : event.summary;

  return (
    <Box paddingLeft={1}>
      <Text color="#4A3F35">{time} </Text>
      <Text color={channelColor} bold>{tag} </Text>
      <Text color="#6B6560">{summary}</Text>
    </Box>
  );
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${seconds % 60}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
