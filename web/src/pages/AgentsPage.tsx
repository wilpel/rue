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
      <div className="border-b border-[#1a1a1a] bg-[#0e0e0e] px-6 py-4">
        <h1 className="text-lg font-semibold text-[#e5e5e5]">Agents</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {agents.length === 0 ? (
          <div className="text-center py-20">
            <Bot size={48} className="mx-auto text-[#333] mb-4" />
            <p className="text-[#888] mb-2">No active agents</p>
            <p className="text-[#555] text-sm">Agents appear here when Rue spawns them for tasks</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div key={agent.id} className="bg-[#141414] rounded-xl border border-[#1a1a1a] p-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#c8a050] animate-pulse" />
                  <span className="font-mono text-xs text-[#666]">{agent.id}</span>
                  <span className="text-xs px-2 py-0.5 bg-[#1a1a1a] text-[#c8a050] rounded-full border border-[#2a2a2a]">{agent.lane}</span>
                  <span className="text-xs px-2 py-0.5 bg-[#1a1a1a] text-[#888] rounded-full border border-[#2a2a2a]">{agent.state}</span>
                </div>
                <p className="text-sm text-[#aaa] mt-2 ml-5">{agent.task}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
