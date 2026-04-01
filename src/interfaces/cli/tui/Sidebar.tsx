import { Box, Text } from "ink";
import { RueSpinner } from "./RueSpinner.js";
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
  cost: number;
  timestamp: number;
}

interface SidebarProps {
  agents: AgentActivity[];
  tasks: TaskInfo[];
  events: EventEntry[];
  usageHistory: UsagePoint[];
  totalCost: number;
  height: number;
  width: number;
}

export interface EventEntry {
  channel: string;
  summary: string;
  timestamp: number;
}

export function Sidebar({ agents, tasks, events, usageHistory, totalCost, height, width }: SidebarProps) {
  const agentPanelHeight = Math.max(3, Math.floor(height * 0.2));
  const taskPanelHeight = Math.max(3, Math.floor(height * 0.2));
  const usagePanelHeight = Math.max(5, Math.floor(height * 0.25));
  const eventPanelHeight = height - agentPanelHeight - taskPanelHeight - usagePanelHeight;

  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="single" borderColor="#3A3530" borderLeft borderTop={false} borderBottom={false} borderRight={false}>
      <AgentsPanel agents={agents} height={agentPanelHeight} width={width} />
      <TasksPanel tasks={tasks} height={taskPanelHeight} width={width} />
      <UsagePanel history={usageHistory} totalCost={totalCost} height={usagePanelHeight} width={width} />
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
        <Box paddingLeft={1}><Text color="#4A3F35">no agents</Text></Box>
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
  const isMain = agent.lane === "main";
  const activeColor = isMain ? "#8BA87A" : "#D4956B";
  const color = isActive ? activeColor : agent.state === "completed" ? "#6B6560" : "#C47070";
  const icon = isActive ? "" : agent.state === "completed" ? "+" : "x";
  const elapsed = formatElapsed(Date.now() - agent.startedAt);

  return (
    <Box paddingLeft={1} width={maxWidth}>
      <Text color={color}>{isActive ? <RueSpinner /> : icon} </Text>
      <Text color={isMain ? "#8BA87A" : "#6B6560"} wrap="truncate">{agent.task} </Text>
      <Text color="#4A3F35">{elapsed}</Text>
    </Box>
  );
}

function TasksPanel({ tasks, height, width }: { tasks: TaskInfo[]; height: number; width: number }) {
  const visible = tasks.slice(0, height - 2);
  const contentWidth = width - 4;

  return (
    <Box flexDirection="column" height={height} paddingX={1}>
      <Box>
        <Text color="#E8B87A" bold> Tasks </Text>
        {tasks.length > 0 && <Text color="#7AA2D4">({tasks.length})</Text>}
      </Box>
      <Box borderStyle="single" borderColor="#3A3530" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text> </Text>
      </Box>
      {visible.length === 0 ? (
        <Box paddingLeft={1}><Text color="#4A3F35">no tasks</Text></Box>
      ) : (
        <Box flexDirection="column">
          {visible.map((task) => (
            <TaskRow key={task.id} task={task} maxWidth={contentWidth} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function TaskRow({ task, maxWidth }: { task: TaskInfo; maxWidth: number }) {
  const typeIcon = task.type === "scheduled" ? "[S]" : task.type === "reminder" ? "[R]" : "[W]";
  const priorityColor = task.priority === "urgent" ? "#C47070" : task.priority === "high" ? "#D4956B" : task.priority === "normal" ? "#6B6560" : "#4A3F35";
  const dueStr = task.due_at ? formatRelativeTime(task.due_at) : "";

  return (
    <Box paddingLeft={1} width={maxWidth}>
      <Text color="#7AA2D4">{typeIcon} </Text>
      <Text color={priorityColor} wrap="truncate">{task.title} </Text>
      {dueStr ? <Text color="#4A3F35">{dueStr}</Text> : null}
    </Box>
  );
}

// Braille sparkline characters: ⣀⣤⣶⣿ (bottom to top fill)
const SPARK_CHARS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function UsagePanel({ history, totalCost, height, width }: { history: UsagePoint[]; totalCost: number; height: number; width: number }) {
  const graphWidth = width - 4;
  const graphHeight = height - 3; // header + separator + cost line

  // Build sparkline from recent cost data
  const points = history.slice(-graphWidth);
  const maxCost = points.length > 0 ? Math.max(...points.map(p => p.cost), 0.001) : 0.001;

  // Build graph rows (bottom to top)
  const rows: string[] = [];
  for (let row = 0; row < graphHeight; row++) {
    let line = "";
    for (let col = 0; col < graphWidth; col++) {
      if (col < points.length) {
        const normalized = points[col].cost / maxCost;
        const rowThreshold = (row + 1) / graphHeight;
        const rowBottom = row / graphHeight;
        if (normalized >= rowThreshold) {
          line += "█";
        } else if (normalized > rowBottom) {
          const partial = (normalized - rowBottom) / (1 / graphHeight);
          const charIdx = Math.min(Math.floor(partial * SPARK_CHARS.length), SPARK_CHARS.length - 1);
          line += SPARK_CHARS[charIdx];
        } else {
          line += " ";
        }
      } else {
        line += " ";
      }
    }
    rows.unshift(line); // top row first
  }

  return (
    <Box flexDirection="column" height={height} paddingX={1}>
      <Box>
        <Text color="#E8B87A" bold> Usage </Text>
        <Text color="#6B6560">${totalCost.toFixed(2)}</Text>
      </Box>
      <Box borderStyle="single" borderColor="#3A3530" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text> </Text>
      </Box>
      {points.length === 0 ? (
        <Box paddingLeft={1}><Text color="#4A3F35">no usage yet</Text></Box>
      ) : (
        <Box flexDirection="column">
          {rows.map((row, i) => (
            <Text key={i} color="#D4956B">{row}</Text>
          ))}
          <Text color="#4A3F35"> {points.length} calls | max ${maxCost.toFixed(3)}</Text>
        </Box>
      )}
    </Box>
  );
}

function EventsPanel({ events, height, width }: { events: EventEntry[]; height: number; width: number }) {
  const reversed = [...events].reverse().slice(0, height - 2);
  const contentWidth = width - 4;

  return (
    <Box flexDirection="column" height={height} paddingX={1}>
      <Box>
        <Text color="#E8B87A" bold> Events </Text>
      </Box>
      <Box borderStyle="single" borderColor="#3A3530" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text> </Text>
      </Box>
      {reversed.length === 0 ? (
        <Box paddingLeft={1}><Text color="#4A3F35">no events</Text></Box>
      ) : (
        <Box flexDirection="column">
          {reversed.map((evt, i) => (
            <EventRow key={`${evt.timestamp}-${i}`} event={evt} maxWidth={contentWidth} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function EventRow({ event, maxWidth }: { event: EventEntry; maxWidth: number }) {
  const time = formatTime(event.timestamp);
  const tag = event.channel.split(":").pop() ?? event.channel;

  const channelColor = event.channel === "delegate:question" ? "#7AA2D4"
    : event.channel === "delegate:answer" ? "#8BA87A"
    : event.channel.startsWith("agent:") ? "#D4956B"
    : event.channel.startsWith("system:") ? "#8BA87A"
    : event.channel.startsWith("task:") ? "#7AA2D4"
    : "#6B6560";

  return (
    <Box paddingLeft={1} flexDirection="column" width={maxWidth}>
      <Box>
        <Text color="#4A3F35">{time} </Text>
        <Text color={channelColor} bold>{tag} </Text>
      </Box>
      {event.summary ? (
        <Box paddingLeft={2} width={maxWidth - 2}>
          <Text color="#6B6560" wrap="wrap">{event.summary}</Text>
        </Box>
      ) : null}
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
