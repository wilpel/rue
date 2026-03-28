import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Plus, ArrowRight } from "lucide-react";
import { api, type ProjectSummary } from "../lib/api";

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.projects().then(setProjects).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-border-subtle px-6 py-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-text-secondary">Projects</h1>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-bg text-xs font-semibold rounded-lg transition-colors duration-150">
          <Plus size={14} />
          New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-center py-24">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse-accent mx-auto" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24">
            <FolderKanban size={32} className="mx-auto text-text-muted/30 mb-4" strokeWidth={1} />
            <p className="text-text-muted text-sm mb-1">No projects yet</p>
            <p className="text-text-muted/60 text-xs">Ask Rue to create one</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
            {projects.map((p) => (
              <Link
                key={p.name}
                to={`/projects/${p.name}`}
                className="group bg-surface rounded-xl border border-border p-5 hover:border-accent/30 transition-colors duration-150"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-medium text-text-primary text-sm">{p.name}</h3>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    p.status === "active" ? "bg-accent-muted text-accent" : "bg-surface-elevated text-text-muted"
                  }`}>{p.status}</span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed mb-4 line-clamp-2">{p.description}</p>
                <div className="flex items-center gap-4 text-[11px] text-text-muted">
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-text-muted/40" />{p.taskCounts.todo} todo</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-in-progress/60" />{p.taskCounts["in-progress"]} active</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-success/60" />{p.taskCounts.done} done</span>
                </div>
                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-end">
                  <ArrowRight size={14} className="text-text-muted/30 group-hover:text-accent transition-colors duration-150" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
