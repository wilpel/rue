import { useMemo, useState, useEffect } from "react";
import { Box, Text } from "ink";
import { COLORS } from "./theme.js";
import type { AgentActivity } from "./App.js";

export interface TaskInfo {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  due_at?: number;
}

export interface EventEntry {
  channel: string;
  summary: string;
  timestamp: number;
}

interface RightPanelsProps {
  agents: AgentActivity[];
  tasks: TaskInfo[];
  events: EventEntry[];
  totalTokens: number;
  totalCost: number;
  height: number;
  width: number;
  isLoading: boolean;
}

// ── Braille sparkline — looks sharper than block chars ──────────

function BrailleSpark({ data, width, color }: { data: number[]; width: number; color: string }) {
  const visible = data.slice(-width);
  const max = Math.max(...visible, 1);
  // Map to 4 levels using braille dots
  const chars = [" ", "⣀", "⣤", "⣶", "⣿"];
  const line = visible.map(v => {
    const idx = Math.min(chars.length - 1, Math.floor((v / max) * (chars.length - 1)));
    return chars[idx];
  }).join("");
  const pad = " ".repeat(Math.max(0, width - visible.length));
  return <Text color={color}>{pad}{line}</Text>;
}

// ── Agent with inline progress ─────────────────────────────────

function AgentRow({ agent, width }: { agent: AgentActivity; width: number }) {
  const [tick, setTick] = useState(0);
  const isActive = agent.state === "spawned" || agent.state === "running";

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => setTick(t => t + 1), 300);
    return () => clearInterval(timer);
  }, [isActive]);

  const elapsed = formatElapsed(Date.now() - agent.startedAt);
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const spinner = isActive ? spinnerFrames[tick % spinnerFrames.length] : "";

  const color = isActive ? COLORS.success
    : agent.state === "completed" ? COLORS.dimmed
    : COLORS.urgent;
  const icon = isActive ? spinner
    : agent.state === "completed" ? "✓"
    : "✕";

  const nameMax = Math.max(4, width - elapsed.length - 4);
  const name = agent.task.length > nameMax ? agent.task.slice(0, nameMax - 1) + "…" : agent.task;

  return (
    <Box justifyContent="space-between" width={width}>
      <Text color={color}>{icon} <Text color={isActive ? COLORS.dimmed : COLORS.veryDim}>{name}</Text></Text>
      <Text color={COLORS.veryDim}>{elapsed}</Text>
    </Box>
  );
}

// ── Heartbeat — shows daemon is alive ──────────────────────────

// ── Main panels ────────────────────────────────────────────────

export function RightPanels({ agents, tasks, events, totalTokens, totalCost, height, width, isLoading }: RightPanelsProps) {
  const innerWidth = width - 4;
  const activeAgents = agents.filter(a => a.state === "spawned" || a.state === "running");
  const recentDone = agents.filter(a => a.state === "completed" || a.state === "failed" || a.state === "killed").slice(-2);
  const allAgents = [...activeAgents, ...recentDone];
  const hasTasks = tasks.length > 0;

  // Sizing
  const agentRows = Math.max(1, Math.min(allAgents.length || 1, Math.floor(height * 0.18)));
  const taskRows = hasTasks ? Math.max(1, Math.min(tasks.length, Math.floor(height * 0.15))) : 1;
  const usageRows = 3; // sparkline + stats + heartbeat
  // 4 section labels + 3 dividers + usage
  const fixedLines = 7 + usageRows;
  const eventRows = Math.max(1, height - fixedLines - agentRows - taskRows - 2);

  const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
  const divider = "─".repeat(innerWidth);

  // Sparkline from event frequency
  const sparkData = useMemo(() => {
    const buckets = new Array(Math.max(1, innerWidth)).fill(0);
    const now = Date.now();
    for (const evt of events.slice(-200)) {
      const age = (now - evt.timestamp) / 1000;
      const bucket = Math.floor(age / 5);
      if (bucket >= 0 && bucket < buckets.length) buckets[buckets.length - 1 - bucket]++;
    }
    return buckets;
  }, [events, innerWidth]);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={COLORS.border}
      paddingX={1}
    >
      {/* ── AGENTS ── */}
      <Box justifyContent="space-between" width={innerWidth}>
        <Text color={COLORS.dimmed} bold>AGENTS</Text>
        {activeAgents.length > 0
          ? <Text color={COLORS.success}>{activeAgents.length}↑</Text>
          : <Text color={COLORS.veryDim}>–</Text>
        }
      </Box>
      <Box flexDirection="column" overflow="hidden">
        {allAgents.length === 0 ? (
          <Text color={COLORS.veryDim}> idle</Text>
        ) : (
          allAgents.slice(0, agentRows).map(a => (
            <AgentRow key={a.id} agent={a} width={innerWidth} />
          ))
        )}
      </Box>
      <Text color={COLORS.border}>{divider}</Text>

      {/* ── TASKS ── */}
      <Box justifyContent="space-between" width={innerWidth}>
        <Text color={COLORS.dimmed} bold>TASKS</Text>
        <Text color={COLORS.veryDim}>{tasks.length || "–"}</Text>
      </Box>
      <Box flexDirection="column" overflow="hidden">
        {tasks.length === 0 ? (
          <Text color={COLORS.veryDim}> none</Text>
        ) : (
          tasks.slice(0, taskRows).map(t => {
            const pColor = t.priority === "urgent" ? COLORS.urgent : t.priority === "high" ? COLORS.secondary : COLORS.dimmed;
            const due = t.due_at ? formatRelativeTime(t.due_at) : "";
            const bar = t.priority === "urgent" ? "▌" : t.priority === "high" ? "▎" : " ";
            const nameMax = Math.max(4, innerWidth - due.length - 4);
            const name = t.title.length > nameMax ? t.title.slice(0, nameMax - 1) + "…" : t.title;
            return (
              <Box key={t.id} justifyContent="space-between" width={innerWidth}>
                <Text color={pColor}>{bar}{name}</Text>
                {due ? <Text color={COLORS.veryDim}>{due}</Text> : null}
              </Box>
            );
          })
        )}
      </Box>
      <Text color={COLORS.border}>{divider}</Text>

      {/* ── EVENTS ── */}
      <Box justifyContent="space-between" width={innerWidth}>
        <Text color={isLoading ? COLORS.secondary : COLORS.dimmed} bold>EVENTS</Text>
        <Text color={COLORS.veryDim}>{events.length || "–"}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {events.length === 0 ? (
          <Text color={COLORS.veryDim}> waiting</Text>
        ) : (
          [...events].reverse().slice(0, eventRows).map((evt, i) => {
            const tag = evt.channel.split(":").pop() ?? "";
            const channelColor = evt.channel.startsWith("agent:") ? COLORS.secondary
              : evt.channel.startsWith("task:") ? COLORS.info
              : evt.channel.startsWith("delegate:") ? COLORS.success
              : COLORS.dimmed;
            const time = new Date(evt.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
            const summaryMax = Math.max(1, innerWidth - tag.length - 8);
            const summary = evt.summary.length > summaryMax ? evt.summary.slice(0, summaryMax - 1) + "…" : evt.summary;
            return (
              <Box key={`${evt.timestamp}-${i}`} width={innerWidth}>
                <Text color={COLORS.veryDim}>{time} </Text>
                <Text color={channelColor}>{tag} </Text>
                <Text color={COLORS.veryDim} wrap="truncate">{summary}</Text>
              </Box>
            );
          })
        )}
      </Box>
      <Text color={COLORS.border}>{divider}</Text>

      {/* ── USAGE ── */}
      <BrailleSpark data={sparkData} width={innerWidth} color={COLORS.secondary} />
      <Box justifyContent="space-between" width={innerWidth}>
        <Text color={COLORS.dimmed}>{fmtTokens(totalTokens)} tok</Text>
        <Text color={COLORS.veryDim}>${totalCost.toFixed(2)}</Text>
      </Box>
      <Box justifyContent="flex-end" width={innerWidth}>
        <Text color={COLORS.veryDim}>{events.length > 0 ? `${Math.round(events.length / Math.max(1, (Date.now() - events[0].timestamp) / 3600000))}/hr` : ""}</Text>
      </Box>
    </Box>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

function formatRelativeTime(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "due";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
