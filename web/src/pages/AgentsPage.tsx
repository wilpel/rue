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
    <div className="h-full flex flex-col">
      <div className="border-b border-line px-6 py-4">
        <h1 className="text-base font-semibold text-white">Agents</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {agents.length === 0 ? (
          <div className="text-center py-24">
            <Bot size={32} className="mx-auto text-dim/30 mb-3" strokeWidth={1} />
            <p className="text-dim text-sm mb-1">No active agents</p>
            <p className="text-dim/60 text-xs">They show up when Rue spawns them</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-2">
            {agents.map(a => (
              <div key={a.id} className="p-4 rounded-xl border border-line bg-raised">
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber" />
                  <span className="font-code text-[10px] text-dim">{a.id}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-dim text-amber rounded-full">{a.lane}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-elevated text-dim rounded-full">{a.state}</span>
                </div>
                <p className="text-xs text-gray ml-[18px]">{a.task}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
