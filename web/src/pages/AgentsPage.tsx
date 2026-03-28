import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { api, type DaemonStatus } from "../lib/api";

export function AgentsPage() {
  const [agents, setAgents] = useState<DaemonStatus["agents"]>([]);
  useEffect(() => {
    const load = () => api.daemonStatus().then(r => setAgents(r.agents)).catch(() => {});
    load(); const i = setInterval(load, 3000); return () => clearInterval(i);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-glass-border glass px-6 py-3.5">
        <h1 className="text-sm font-semibold text-text-secondary">Agents</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {agents.length === 0 ? (
          <div className="text-center py-24 animate-fade-up">
            <Bot size={36} className="mx-auto text-text-muted/15 mb-4" strokeWidth={1} />
            <p className="text-text-muted text-sm mb-1">No active agents</p>
            <p className="text-text-muted/50 text-xs">They appear when Rue spawns them</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-3">
            {agents.map(a => (
              <div key={a.id} className="glass glass-hover rounded-2xl p-4 transition-all duration-200 animate-fade-up">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-breathe" />
                  <span className="font-mono text-[10px] text-text-muted">{a.id}</span>
                  <span className="text-[10px] px-2 py-0.5 bg-accent-glow text-accent rounded-full font-medium">{a.lane}</span>
                  <span className="text-[10px] px-2 py-0.5 glass text-text-muted rounded-full">{a.state}</span>
                </div>
                <p className="text-xs text-text-secondary ml-[18px]">{a.task}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
