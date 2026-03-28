import { useEffect, useState } from "react";
import { useClient } from "../lib/context";
import { Bot } from "lucide-react";

interface Agent {
  id: string;
  task: string;
  state: string;
  lane: string;
}

export function AgentsPage() {
  const client = useClient();
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const load = () => {
      client.status().then((r) => setAgents(r.agents as Agent[])).catch(() => {});
    };
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [client]);

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-amber-100 bg-white/60 px-6 py-4">
        <h1 className="text-lg font-semibold text-stone-700">Agents</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {agents.length === 0 ? (
          <div className="text-center py-20">
            <Bot size={48} className="mx-auto text-stone-200 mb-4" />
            <p className="text-stone-400 mb-2">No active agents</p>
            <p className="text-stone-300 text-sm">Agents appear here when Rue spawns them for tasks</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div key={agent.id} className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="font-mono text-xs text-stone-400">{agent.id}</span>
                  <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">{agent.lane}</span>
                  <span className="text-xs px-2 py-0.5 bg-stone-50 text-stone-500 rounded-full">{agent.state}</span>
                </div>
                <p className="text-sm text-stone-600 mt-2 ml-5">{agent.task}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
