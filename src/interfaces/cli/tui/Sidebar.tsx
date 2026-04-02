import { useMemo } from "react";
import { Box, Text } from "ink";
import { RueSpinner } from "./RueSpinner.js";
import { COLORS, LAYOUT } from "./theme.js";
import type { AgentActivity } from "./App.js";

export interface TaskInfo {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  due_at?: number;
}

export interface UsagePoint {
  tokens: number;
  timestamp: number;
}

interface SidebarProps {
  agents: AgentActivity[];
  tasks: TaskInfo[];
  events: EventEntry[];
  usageHistory: UsagePoint[];
  totalCost: number;
  totalTokens: number;
  height: number;
  width: number;
}

export interface EventEntry {
  channel: string;
  summary: string;
  timestamp: number;
}

export function Sidebar({ agents, tasks, events, usageHistory, totalCost, totalTokens, height, width }: SidebarProps) {
  const agentPanelHeight = Math.max(LAYOUT.minPanelHeight, Math.floor(height * LAYOUT.agentPanelRatio));
  const taskPanelHeight = Math.max(LAYOUT.minPanelHeight, Math.floor(height * LAYOUT.taskPanelRatio));
  const usagePanelHeight = Math.max(LAYOUT.minUsagePanelHeight, Math.floor(height * LAYOUT.usagePanelRatio));
  const eventPanelHeight = Math.max(LAYOUT.minPanelHeight, height - agentPanelHeight - taskPanelHeight - usagePanelHeight);

  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="single" borderColor={COLORS.border} borderLeft borderTop={false} borderBottom={false} borderRight={false}>
      <AgentsPanel agents={agents} height={agentPanelHeight} width={width} />
      <TasksPanel tasks={tasks} height={taskPanelHeight} width={width} />
      <UsagePanel history={usageHistory} totalCost={totalCost} totalTokens={totalTokens} height={usagePanelHeight} width={width} />
      <EventsPanel events={events} height={eventPanelHeight} width={width} />
    </Box>
  );
}

function PanelHeader({ label, count, countColor }: { label: string; countColor?: string; count?: number }) {
  return (
    <>
      <Box>
        <Text color={COLORS.primary} bold> {label} </Text>
        {count !== undefined && count > 0 && <Text color={countColor ?? COLORS.dimmed}>({count})</Text>}
      </Box>
      <Box borderStyle="single" borderColor={COLORS.border} borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text> </Text>
      </Box>
    </>
  );
}

function AgentsPanel({ agents, height, width }: { agents: AgentActivity[]; height: number; width: number }) {
  const activeAgents = agents.filter(a => a.state === "spawned" || a.state === "running");
  const recentDone = agents.filter(a => a.state === "completed" || a.state === "failed" || a.state === "killed").slice(-LAYOUT.minPanelHeight);
  const maxVisible = height - 2;
  const all = [...activeAgents, ...recentDone];
  const visible = all.slice(0, maxVisible);
  const overflow = all.length - visible.length;

  return (
    <Box flexDirection="column" height={height} paddingX={1} overflow="hidden">
      <PanelHeader label="Agents" count={activeAgents.length} countColor={COLORS.secondary} />
      {visible.length === 0 ? (
        <Box paddingLeft={1}><Text color={COLORS.veryDim}>no agents</Text></Box>
      ) : (
        <Box flexDirection="column">
          {visible.map((agent) => (
            <SidebarAgentRow key={agent.id} agent={agent} maxWidth={width - 4} />
          ))}
          {overflow > 0 && <Box paddingLeft={1}><Text color={COLORS.veryDim}>+{overflow} more</Text></Box>}
        </Box>
      )}
    </Box>
  );
}

function SidebarAgentRow({ agent, maxWidth }: { agent: AgentActivity; maxWidth: number }) {
  const isActive = agent.state === "spawned" || agent.state === "running";
  const isMain = agent.lane === "main";
  const activeColor = isMain ? COLORS.success : COLORS.secondary;
  const color = isActive ? activeColor : agent.state === "completed" ? COLORS.dimmed : COLORS.urgent;
  const icon = isActive ? "" : agent.state === "completed" ? "+" : "x";
  const elapsed = formatElapsed(Date.now() - agent.startedAt);

  return (
    <Box paddingLeft={1} width={maxWidth}>
      <Text color={color}>{isActive ? <RueSpinner /> : icon} </Text>
      <Text color={isMain ? COLORS.success : COLORS.dimmed} wrap="truncate">{agent.task} </Text>
      <Text color={COLORS.veryDim}>{elapsed}</Text>
    </Box>
  );
}

function TasksPanel({ tasks, height, width }: { tasks: TaskInfo[]; height: number; width: number }) {
  const maxVisible = height - 2;
  const visible = tasks.slice(0, maxVisible);
  const overflow = tasks.length - visible.length;
  const contentWidth = width - 4;

  return (
    <Box flexDirection="column" height={height} paddingX={1} overflow="hidden">
      <PanelHeader label="Tasks" count={tasks.length} countColor={COLORS.info} />
      {visible.length === 0 ? (
        <Box paddingLeft={1}><Text color={COLORS.veryDim}>no tasks</Text></Box>
      ) : (
        <Box flexDirection="column">
          {visible.map((task) => (
            <TaskRow key={task.id} task={task} maxWidth={contentWidth} />
          ))}
          {overflow > 0 && <Box paddingLeft={1}><Text color={COLORS.veryDim}>+{overflow} more</Text></Box>}
        </Box>
      )}
    </Box>
  );
}

function TaskRow({ task, maxWidth }: { task: TaskInfo; maxWidth: number }) {
  const typeIcon = task.type === "scheduled" ? "[S]" : task.type === "reminder" ? "[R]" : "[W]";
  const priorityColor = task.priority === "urgent" ? COLORS.urgent
    : task.priority === "high" ? COLORS.secondary
    : task.priority === "normal" ? COLORS.dimmed
    : COLORS.veryDim;
  const dueStr = task.due_at ? formatRelativeTime(task.due_at) : "";

  return (
    <Box paddingLeft={1} width={maxWidth}>
      <Text color={COLORS.info}>{typeIcon} </Text>
      <Text color={priorityColor} wrap="truncate">{task.title} </Text>
      {dueStr ? <Text color={COLORS.veryDim}>{dueStr}</Text> : null}
    </Box>
  );
}

function UsagePanel({ history, totalCost, totalTokens, height, width }: { history: UsagePoint[]; totalCost: number; totalTokens: number; height: number; width: number }) {
  const graphWidth = width - 4;
  const graphHeight = height - 3;

  const rows = useMemo(() => {
    // Take last graphWidth points, pad left with zeros — newest on right, scrolls left
    const raw = history.slice(-graphWidth);
    const padCount = Math.max(0, graphWidth - raw.length);
    const values = [...Array(padCount).fill(0), ...raw.map(p => p.tokens)];

    // Use all-time max so bars never rescale — only grows
    const allTimeMax = Math.max(...history.map(p => p.tokens), 1);
    const normalized = values.map(v => (v / allTimeMax) * graphHeight);

    const result: string[] = [];
    for (let row = graphHeight - 1; row >= 0; row--) {
      let line = "";
      for (let col = 0; col < graphWidth; col++) {
        const val = normalized[col];
        if (val > row + 0.75) line += "█";
        else if (val > row + 0.5) line += "▓";
        else if (val > row + 0.25) line += "▒";
        else if (val > row) line += "░";
        else line += " ";
      }
      result.push(line);
    }
    return result;
  }, [history, graphWidth, graphHeight]);

  const formatTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

  return (
    <Box flexDirection="column" height={height} paddingX={1} overflow="hidden">
      <Box justifyContent="space-between" width={width - 3}>
        <Box>
          <Text color={COLORS.primary} bold> Tokens </Text>
          <Text color={COLORS.dimmed}>{formatTokens(totalTokens)}</Text>
        </Box>
        <Text color={COLORS.veryDim}>${totalCost.toFixed(2)}</Text>
      </Box>
      <Box borderStyle="single" borderColor={COLORS.border} borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text> </Text>
      </Box>
      {totalTokens === 0 ? (
        <Box paddingLeft={1}><Text color={COLORS.veryDim}>no usage yet</Text></Box>
      ) : (
        <Box flexDirection="column">
          {rows.map((row, i) => (
            <Text key={i} color={COLORS.secondary}>{row}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function EventsPanel({ events, height, width }: { events: EventEntry[]; height: number; width: number }) {
  // Each event takes ~2 lines (header + summary), so show half of available lines
  const maxEvents = Math.max(1, Math.floor((height - 2) / 2));
  const totalEvents = events.length;
  const reversed = [...events].reverse().slice(0, Math.min(maxEvents, LAYOUT.maxEvents));
  const overflow = totalEvents - reversed.length;
  const contentWidth = width - 4;

  return (
    <Box flexDirection="column" height={height} paddingX={1} overflow="hidden">
      <PanelHeader label="Events" />
      {reversed.length === 0 ? (
        <Box paddingLeft={1}><Text color={COLORS.veryDim}>no events</Text></Box>
      ) : (
        <Box flexDirection="column" overflow="hidden">
          {reversed.map((evt, i) => (
            <EventRow key={`${evt.timestamp}-${i}`} event={evt} maxWidth={contentWidth} />
          ))}
          {overflow > 0 && <Box paddingLeft={1}><Text color={COLORS.veryDim}>+{overflow} more</Text></Box>}
        </Box>
      )}
    </Box>
  );
}

function EventRow({ event, maxWidth }: { event: EventEntry; maxWidth: number }) {
  const time = formatTime(event.timestamp);
  const tag = event.channel.split(":").pop() ?? event.channel;

  const channelColor = event.channel === "delegate:question" ? COLORS.info
    : event.channel === "delegate:answer" ? COLORS.success
    : event.channel.startsWith("agent:") ? COLORS.secondary
    : event.channel.startsWith("system:") ? COLORS.success
    : event.channel.startsWith("task:") ? COLORS.info
    : COLORS.dimmed;

  return (
    <Box paddingLeft={1} width={maxWidth}>
      <Text color={COLORS.veryDim}>{time} </Text>
      <Text color={channelColor} bold>{tag} </Text>
      {event.summary ? <Text color={COLORS.dimmed} wrap="truncate">{event.summary.slice(0, maxWidth - 18)}</Text> : null}
    </Box>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "due";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
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
