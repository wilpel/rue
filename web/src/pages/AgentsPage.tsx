import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { api, type DaemonStatus } from "../lib/api";

export function AgentsPage() {
  const [agents, setAgents] = useState<DaemonStatus["agents"]>([]);

  useEffect(() => {
    const load = () => api.daemonStatus().then(r => setAgents(r.agents)).catch(() => {});
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-border-subtle bg-surface-1/50 px-6 py-3.5">
        <h1 className="text-sm font-semibold text-text-secondary tracking-wide">Agents</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {agents.length === 0 ? (
          <div className="text-center py-24 animate-fade-in">
            <Bot size={32} className="mx-auto text-text-muted/20 mb-4" strokeWidth={1} />
            <p className="text-text-muted text-sm mb-1">No active agents</p>
            <p className="text-text-muted/60 text-xs">Agents appear here when Rue spawns them</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-3">
            {agents.map(agent => (
              <div key={agent.id} className="bg-surface-1 rounded-xl border border-border-subtle p-4 animate-slide-in">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-gold" />
                  <span className="font-mono text-[10px] text-text-muted">{agent.id}</span>
                  <span className="text-[10px] px-2 py-0.5 bg-gold/10 text-gold rounded-full font-medium">{agent.lane}</span>
                  <span className="text-[10px] px-2 py-0.5 bg-surface-3 text-text-muted rounded-full">{agent.state}</span>
                </div>
                <p className="text-xs text-text-secondary ml-[18px]">{agent.task}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
