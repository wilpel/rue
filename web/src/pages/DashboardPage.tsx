import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, FolderKanban, Activity, ArrowRight, Zap } from "lucide-react";
import { useMessages, useTasks } from "../lib/hooks";
import { supabase } from "../lib/supabase";

interface AgentInfo { id: string; task: string; state: string; lane: string }

export function DashboardPage() {
  const { messages } = useMessages(20);
  const { tasks } = useTasks();
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    const load = () => {
      fetch("/api/status").then(r => r.json()).then(d => setAgents(d.agents ?? [])).catch(() => {});
    };
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  // Also fetch events for activity feed
  const [events, setEvents] = useState<Array<{ id: number; channel: string; payload: Record<string, unknown>; created_at: number }>>([]);
  useEffect(() => {
    supabase.from("events").select("*").order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setEvents((data ?? []) as typeof events));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const activeTasks = tasks.filter(t => t.status === "active" || t.status === "pending").length;
  const completedTasks = tasks.filter(t => t.status === "completed").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text tracking-tight">{greeting}</h1>
          <p className="text-secondary text-sm mt-1">Here's what's happening with Rue</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          <Stat label="Active tasks" value={activeTasks} icon={Activity} accent />
          <Stat label="Completed" value={completedTasks} icon={Zap} />
          <Stat label="Total tasks" value={tasks.length} icon={FolderKanban} />
          <Stat label="Agents" value={agents.length} icon={Bot} accent={agents.length > 0} />
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Active agents */}
          <div className="col-span-1">
            <SectionHeader title="Active Agents" to="/agents" />
            <div className="space-y-2">
              {agents.length === 0 ? (
                <Empty>No active agents</Empty>
              ) : agents.map(a => (
                <div key={a.id} className="p-3 rounded-lg border border-line bg-surface">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-[10px] font-mono text-muted truncate">{a.id.slice(0, 24)}</span>
                  </div>
                  <p className="text-[11px] text-secondary truncate">{a.task}</p>
                  <span className="text-[9px] text-muted">{a.lane}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tasks */}
          <div className="col-span-1">
            <SectionHeader title="Tasks" to="/projects" />
            <div className="space-y-2">
              {tasks.length === 0 ? (
                <Empty>No tasks</Empty>
              ) : tasks.slice(0, 8).map(t => (
                <div key={t.id} className="p-3 rounded-lg border border-line bg-surface">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-text truncate">{t.title}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                      t.status === "completed" ? "bg-green/10 text-green" :
                      t.status === "active" ? "bg-accent-soft text-accent" :
                      "bg-surface text-muted"
                    }`}>{t.status}</span>
                  </div>
                  <span className="text-[10px] text-muted">{t.type} · {t.priority}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Event activity */}
          <div className="col-span-1">
            <SectionHeader title="Recent Activity" />
            <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
              {events.length === 0 ? (
                <Empty>No activity</Empty>
              ) : events.map(e => (
                <div key={e.id} className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-surface transition-colors">
                  <span className="text-[10px] text-muted shrink-0 mt-0.5 font-mono w-10">{formatTime(e.created_at)}</span>
                  <span className="text-[10px] text-accent font-mono shrink-0">{e.channel.split(":")[1] ?? e.channel}</span>
                  <span className="text-[10px] text-muted truncate">{typeof e.payload === "object" ? (e.payload as Record<string, unknown>).task as string ?? (e.payload as Record<string, unknown>).id as string ?? "" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent messages */}
        <div className="mt-8">
          <SectionHeader title="Recent Messages" to="/chat" />
          <div className="space-y-1">
            {messages.filter(m => m.role === "channel").slice(-8).map(m => {
              const tag = (m.metadata as Record<string, unknown>)?.tag as string ?? "";
              const isUser = tag.startsWith("USER");
              return (
                <div key={m.id} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-surface transition-colors">
                  <span className={`text-[10px] font-semibold uppercase w-8 shrink-0 mt-0.5 ${isUser ? "text-secondary" : "text-accent"}`}>
                    {isUser ? "You" : "Rue"}
                  </span>
                  <p className="text-xs text-secondary truncate">{m.content}</p>
                  <span className="text-[10px] text-muted ml-auto shrink-0">{formatTime(m.created_at)}</span>
                </div>
              );
            })}
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
        <span className={accent ? "text-accent" : "text-muted"}><Icon size={14} /></span>
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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
