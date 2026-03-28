import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Plus } from "lucide-react";
import { api, type ProjectSummary } from "../lib/api";

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.projects().then(setProjects).catch(() => {}).finally(() => setLoading(false)); }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-line px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-white">Projects</h1>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-amber text-bg text-xs font-semibold rounded-lg hover:bg-amber/90 transition-colors">
          <Plus size={14} /> New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-dim text-sm text-center py-24">Loading...</p>
        ) : projects.length === 0 ? (
          <div className="text-center py-24">
            <FolderKanban size={32} className="mx-auto text-dim/40 mb-3" strokeWidth={1} />
            <p className="text-dim text-sm">No projects yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-w-5xl">
            {projects.map(p => (
              <Link key={p.name} to={`/projects/${p.name}`}
                className="p-4 rounded-xl border border-line bg-raised hover:border-line-strong transition-colors group">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-medium text-white truncate">{p.name}</h3>
                  <span className="text-[9px] px-1.5 py-0.5 bg-amber-dim text-amber rounded-full">{p.status}</span>
                </div>
                <p className="text-xs text-dim leading-relaxed mb-3 line-clamp-2">{p.description}</p>
                <div className="flex gap-4 text-[11px] text-dim">
                  <span>{p.taskCounts.todo} todo</span>
                  <span className="text-amber">{p.taskCounts["in-progress"]} active</span>
                  <span className="text-green">{p.taskCounts.done} done</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
