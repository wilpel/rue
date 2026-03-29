import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, FolderKanban, Activity, MessageCircle, Clock, ArrowRight, Zap } from "lucide-react";

interface DashboardData {
  agents: Array<{ id: string; task: string; state: string; lane: string }>;
  projects: Array<{ name: string; description: string; status: string; taskCounts: { todo: number; "in-progress": number; done: number } }>;
  recentMessages: Array<{ id: string; role: string; content: string; timestamp: number }>;
  events: Array<{ seq: number; ts: number; channel: string; payload: unknown }>;
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const load = () => fetch("/api/dashboard").then(r => r.json()).then(setData).catch(() => {});
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  if (!data) return <div className="h-full flex items-center justify-center"><p className="text-muted text-sm">Loading...</p></div>;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const totalTasks = data.projects.reduce((sum, p) => sum + p.taskCounts.todo + p.taskCounts["in-progress"] + p.taskCounts.done, 0);
  const activeTasks = data.projects.reduce((sum, p) => sum + p.taskCounts["in-progress"], 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text tracking-tight">{greeting}</h1>
          <p className="text-secondary text-sm mt-1">Here's what's happening</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          <Stat label="Projects" value={data.projects.length} icon={FolderKanban} />
          <Stat label="Active tasks" value={activeTasks} icon={Activity} accent />
          <Stat label="Total tasks" value={totalTasks} icon={Zap} />
          <Stat label="Agents" value={data.agents.length} icon={Bot} accent={data.agents.length > 0} />
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Projects */}
          <div className="col-span-1">
            <SectionHeader title="Projects" to="/projects" />
            <div className="space-y-2">
              {data.projects.length === 0 ? (
                <Empty>No projects</Empty>
              ) : data.projects.map(p => (
                <Link key={p.name} to={`/projects/${p.name}`} className="block p-3 rounded-lg border border-line bg-surface hover:border-accent/15 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-text truncate">{p.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-accent-soft text-accent rounded-full">{p.status}</span>
                  </div>
                  <div className="flex gap-3 text-[10px] text-muted">
                    <span>{p.taskCounts.todo} todo</span>
                    <span className="text-accent">{p.taskCounts["in-progress"]} active</span>
                    <span className="text-green">{p.taskCounts.done} done</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Agents */}
          <div className="col-span-1">
            <SectionHeader title="Agents" to="/agents" />
            <div className="space-y-2">
              {data.agents.length === 0 ? (
                <Empty>No active agents</Empty>
              ) : data.agents.map(a => (
                <div key={a.id} className="p-3 rounded-lg border border-line bg-surface">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-[10px] font-mono text-muted truncate">{a.id.slice(0, 24)}</span>
                  </div>
                  <p className="text-[11px] text-secondary truncate">{a.task}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Event log */}
          <div className="col-span-1">
            <SectionHeader title="Event log" />
            <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
              {(() => {
                const hidden = new Set(["agent:progress", "agent:completed", "agent:spawned", "interface:stream", "system:health"]);
                const visible = data.events.filter(e => !hidden.has(e.channel));
                return visible.length === 0 ? (
                  <Empty>No events</Empty>
                ) : visible.map(evt => (
                  <EventRow key={evt.seq} event={evt} />
                ));
              })()}
            </div>
          </div>
        </div>

        {/* Recent messages */}
        <div className="mt-8">
          <SectionHeader title="Recent messages" to="/chat" />
          <div className="space-y-1">
            {data.recentMessages.filter(m => m.role === "user" || m.role === "assistant").slice(-6).map(m => (
              <div key={m.id} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-surface transition-colors">
                <span className={`text-[10px] font-semibold uppercase w-8 shrink-0 mt-0.5 ${m.role === "user" ? "text-secondary" : "text-accent"}`}>
                  {m.role === "user" ? "You" : "Rue"}
                </span>
                <p className="text-xs text-secondary truncate">{m.content}</p>
                <span className="text-[10px] text-muted ml-auto shrink-0">{formatTime(m.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ComponentType<{ size?: number }>; accent?: boolean }) {
  return (
    <div className="p-4 rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between mb-2">
        <Icon size={14} className={accent ? "text-accent" : "text-muted"} />
      </div>
      <p className={`text-2xl font-bold ${accent ? "text-accent" : "text-text"}`}>{value}</p>
      <p className="text-[11px] text-muted mt-0.5">{label}</p>
    </div>
  );
}

function SectionHeader({ title, to }: { title: string; to?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">{title}</h2>
      {to && (
        <Link to={to} className="text-[10px] text-muted hover:text-secondary transition-colors flex items-center gap-1">
          View all <ArrowRight size={10} />
        </Link>
      )}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <div className="p-4 rounded-lg border border-dashed border-line text-center"><p className="text-[11px] text-muted/40">{children}</p></div>;
}

function EventRow({ event }: { event: { seq: number; ts: number; channel: string; payload: unknown } }) {
  const channel = event.channel;
  const isAgent = channel.startsWith("agent:");
  const isTask = channel.startsWith("task:");
  const isSystem = channel.startsWith("system:");
  const isMessage = channel.startsWith("message:");

  const color = isAgent ? "text-accent" : isTask ? "text-green" : isSystem ? "text-secondary" : isMessage ? "text-blue-400" : "text-muted";
  const payload = event.payload as Record<string, unknown> | null;
  const detail = payload?.task ?? payload?.result ?? payload?.reason ?? payload?.content ?? "";

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-surface transition-colors">
      <span className="text-[10px] text-muted shrink-0 mt-0.5 font-mono w-10">{formatTime(event.ts)}</span>
      <span className={`text-[10px] font-mono shrink-0 ${color}`}>{channel}</span>
      {detail && <span className="text-[10px] text-muted truncate">{String(detail).slice(0, 60)}</span>}
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
