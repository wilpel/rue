import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Plus, ArrowRight } from "lucide-react";
import { api, type ProjectSummary } from "../lib/api";

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.projects().then(setProjects).catch(() => {}).finally(() => setLoading(false)); }, []);

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-glass-border glass px-6 py-3.5 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-text-secondary">Projects</h1>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-bg text-xs font-semibold rounded-lg transition-colors">
          <Plus size={14} /> New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-center py-24"><div className="w-2.5 h-2.5 rounded-full bg-accent/40 animate-breathe mx-auto" /></div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24 animate-fade-up">
            <FolderKanban size={36} className="mx-auto text-text-muted/20 mb-4" strokeWidth={1} />
            <p className="text-text-muted text-sm">No projects yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
            {projects.map((p, i) => (
              <Link key={p.name} to={`/projects/${p.name}`}
                className={`glass glass-hover rounded-2xl p-5 transition-all duration-300 group animate-fade-up delay-${Math.min(i+1,3)}`}>
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-text-primary text-sm">{p.name}</h3>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${p.status === "active" ? "bg-accent-glow text-accent" : "bg-glass text-text-muted"}`}>{p.status}</span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed mb-4 line-clamp-2">{p.description}</p>
                <div className="flex items-center gap-4 text-[11px] text-text-muted">
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-text-muted/30" />{p.taskCounts.todo} todo</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-accent/60" />{p.taskCounts["in-progress"]} active</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-success/60" />{p.taskCounts.done} done</span>
                </div>
                <div className="mt-4 pt-3 border-t border-glass-border flex justify-end">
                  <ArrowRight size={14} className="text-text-muted/20 group-hover:text-accent transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
