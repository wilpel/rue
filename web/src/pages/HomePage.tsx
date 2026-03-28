import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Send, FolderKanban, Bot, MessageCircle } from "lucide-react";
import { api, type ProjectSummary, type DaemonStatus } from "../lib/api";

export function HomePage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [agents, setAgents] = useState<DaemonStatus["agents"]>([]);
  const [recent, setRecent] = useState<Array<{ content: string; role: string }>>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    api.projects().then(setProjects).catch(() => {});
    api.daemonStatus().then(r => setAgents(r.agents)).catch(() => {});
    api.history(6).then(r => setRecent(r.messages.slice(-6))).catch(() => {});
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="h-full flex">
      {/* Left: Chat-centric main area */}
      <div className="flex-1 flex flex-col">
        {/* Hero greeting + input */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 max-w-2xl mx-auto w-full">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">{greeting}</h1>
          <p className="text-gray text-sm mb-10">What are you working on?</p>

          <form
            onSubmit={(e) => { e.preventDefault(); if (input.trim()) navigate("/chat"); }}
            className="w-full relative"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onFocus={() => navigate("/chat")}
              placeholder="Ask Rue anything..."
              className="w-full h-14 pl-5 pr-14 bg-raised border border-line rounded-2xl text-white text-sm placeholder:text-dim focus:outline-none focus:border-line-strong transition-colors"
            />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-amber hover:bg-amber/90 rounded-xl flex items-center justify-center transition-colors">
              <Send size={16} className="text-bg" />
            </button>
          </form>

          {/* Recent conversations */}
          {recent.length > 0 && (
            <div className="mt-8 w-full">
              <div className="flex flex-wrap gap-2">
                {recent.filter(m => m.role === "user").slice(-3).map((m, i) => (
                  <Link
                    key={i}
                    to="/chat"
                    className="px-3 py-1.5 bg-raised border border-line rounded-lg text-xs text-gray hover:text-white hover:border-line-strong transition-colors truncate max-w-[200px]"
                  >
                    {m.content}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Context panel */}
      <div className="w-80 border-l border-line bg-raised/50 overflow-y-auto">
        {/* Projects */}
        <div className="p-5 border-b border-line">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-semibold text-dim uppercase tracking-widest">Projects</h2>
            <Link to="/projects" className="text-[11px] text-dim hover:text-gray transition-colors">View all</Link>
          </div>
          {projects.length === 0 ? (
            <div className="text-center py-6">
              <FolderKanban size={20} className="mx-auto text-dim/50 mb-2" />
              <p className="text-xs text-dim">No projects</p>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.slice(0, 4).map(p => (
                <Link key={p.name} to={`/projects/${p.name}`} className="block p-3 rounded-xl border border-line hover:border-line-strong bg-bg/50 transition-colors group">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xs font-medium text-white truncate">{p.name}</h3>
                    <span className="text-[9px] px-1.5 py-0.5 bg-amber-dim text-amber rounded-full shrink-0">{p.status}</span>
                  </div>
                  <p className="text-[11px] text-dim truncate">{p.description}</p>
                  <div className="flex gap-3 mt-2 text-[10px] text-dim">
                    <span>{p.taskCounts.todo} todo</span>
                    <span className="text-amber">{p.taskCounts["in-progress"]} active</span>
                    <span className="text-green">{p.taskCounts.done} done</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Agents */}
        <div className="p-5 border-b border-line">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-semibold text-dim uppercase tracking-widest">Agents</h2>
            <Link to="/agents" className="text-[11px] text-dim hover:text-gray transition-colors">View all</Link>
          </div>
          {agents.length === 0 ? (
            <div className="text-center py-6">
              <Bot size={20} className="mx-auto text-dim/50 mb-2" />
              <p className="text-xs text-dim">No active agents</p>
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map(a => (
                <div key={a.id} className="p-3 rounded-xl border border-line bg-bg/50">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber" />
                    <span className="text-[10px] font-code text-dim truncate">{a.id.slice(0, 20)}</span>
                  </div>
                  <p className="text-[11px] text-gray mt-1 truncate">{a.task}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="p-5">
          <h2 className="text-[11px] font-semibold text-dim uppercase tracking-widest mb-4">Navigate</h2>
          <div className="space-y-1">
            {[
              { to: "/chat", icon: MessageCircle, label: "Open Chat" },
              { to: "/projects", icon: FolderKanban, label: "All Projects" },
              { to: "/agents", icon: Bot, label: "Agent Monitor" },
            ].map(({ to, icon: Icon, label }) => (
              <Link key={to} to={to} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-dim hover:text-white hover:bg-elevated transition-colors group">
                <Icon size={14} />
                <span>{label}</span>
                <ArrowRight size={12} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
