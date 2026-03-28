import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { api, type DaemonStatus } from "../lib/api";

export function AgentsPage() {
  const [agents, setAgents] = useState<DaemonStatus["agents"]>([]);
  useEffect(() => { const l = () => api.daemonStatus().then(r => setAgents(r.agents)).catch(() => {}); l(); const i = setInterval(l, 3000); return () => clearInterval(i); }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="h-12 flex items-center px-5 border-b border-line shrink-0">
        <h1 className="text-sm font-semibold text-text">Agents</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {agents.length === 0 ? (
          <div className="text-center mt-20">
            <Bot size={28} className="mx-auto text-muted/20 mb-2" strokeWidth={1} />
            <p className="text-muted text-sm">No active agents</p>
          </div>
        ) : (
          <div className="max-w-xl space-y-2">
            {agents.map(a => (
              <div key={a.id} className="p-3 rounded-lg border border-line bg-surface">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="font-mono text-[10px] text-muted">{a.id}</span>
                  <span className="text-[9px] px-1.5 py-0.5 bg-accent-soft text-accent rounded-full">{a.lane}</span>
                </div>
                <p className="text-xs text-secondary ml-[14px]">{a.task}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
