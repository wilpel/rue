import { useFacts, useConsolidationLogs } from "../lib/hooks";
import { Brain, Database, Clock } from "lucide-react";

export default function MemoryPage() {
  const { facts, loading: factsLoading } = useFacts(100);
  const { logs, loading: logsLoading } = useConsolidationLogs(20);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-2">
        <span className="text-accent"><Brain size={22} /></span>
        <h1 className="text-2xl font-semibold text-text">Memory</h1>
      </div>

      {/* Facts */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-accent"><Database size={16} /></span>
          <h2 className="text-lg font-medium text-text">Semantic Facts</h2>
          <span className="text-muted text-sm">({facts.length})</span>
        </div>

        {factsLoading ? (
          <p className="text-muted text-sm">Loading...</p>
        ) : facts.length === 0 ? (
          <p className="text-muted text-sm">No facts stored yet.</p>
        ) : (
          <div className="grid gap-2">
            {facts.map(f => (
              <div key={f.key} className="bg-surface border border-line rounded-lg px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{f.key}</p>
                    <p className="text-sm text-secondary mt-0.5">{f.content}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {(f.tags as string[]).map(t => (
                      <span key={t} className="bg-accent-soft text-accent text-[10px] px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 mt-2 text-[10px] text-muted">
                  <span>Accessed: {f.access_count}x</span>
                  <span>Updated: {new Date(f.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Consolidation logs */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-accent"><Clock size={16} /></span>
          <h2 className="text-lg font-medium text-text">Consolidation History</h2>
        </div>

        {logsLoading ? (
          <p className="text-muted text-sm">Loading...</p>
        ) : logs.length === 0 ? (
          <p className="text-muted text-sm">No consolidation runs yet.</p>
        ) : (
          <div className="space-y-1.5">
            {logs.map(l => (
              <div key={l.id} className="flex items-center gap-3 bg-surface border border-line rounded-lg px-4 py-2.5 text-sm">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  l.stage === "triage" ? "bg-blue-500/10 text-blue-400" :
                  l.stage === "consolidation" ? "bg-green/10 text-green" :
                  "bg-accent-soft text-accent"
                }`}>{l.stage}</span>
                <span className="text-secondary flex-1">{l.result ?? "—"}</span>
                <span className="text-muted text-xs">{new Date(l.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
