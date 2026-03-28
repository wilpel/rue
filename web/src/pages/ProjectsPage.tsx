import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Plus } from "lucide-react";
import { api, type ProjectSummary } from "../lib/api";

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.projects()
      .then(setProjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-[#1a1a1a] bg-[#0e0e0e] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#e5e5e5]">Projects</h1>
        <button className="flex items-center gap-2 px-3 py-1.5 bg-[#c8a050] hover:bg-[#d4ad5e] text-[#0a0a0a] text-sm font-medium rounded-lg transition-colors">
          <Plus size={16} />
          New Project
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-center py-20">
            <p className="text-[#888] animate-pulse">Loading projects...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-[#f87171] mb-2">Failed to load projects</p>
            <p className="text-[#555] text-sm">{error}</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <FolderKanban size={48} className="mx-auto text-[#333] mb-4" />
            <p className="text-[#888] mb-2">No projects yet</p>
            <p className="text-[#555] text-sm">Ask Rue to create one, or use the projects skill</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.name}
                to={`/projects/${encodeURIComponent(project.name)}`}
                className="bg-[#141414] rounded-xl border border-[#1a1a1a] p-5 hover:border-[#c8a050]/30 transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-[#e5e5e5] group-hover:text-[#c8a050] transition-colors">
                    {project.name}
                  </h3>
                  <StatusBadge status={project.status} />
                </div>
                <p className="text-sm text-[#888] mb-4 line-clamp-2">{project.description}</p>
                <div className="flex gap-3 text-xs">
                  <TaskCount label="Todo" count={project.taskCounts.todo} color="#888" />
                  <TaskCount label="In Progress" count={project.taskCounts["in-progress"]} color="#c8a050" />
                  <TaskCount label="Done" count={project.taskCounts.done} color="#4ade80" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${
      isActive
        ? "text-[#4ade80] border-[#4ade80]/30 bg-[#4ade80]/10"
        : "text-[#888] border-[#333] bg-[#1a1a1a]"
    }`}>
      {status}
    </span>
  );
}

function TaskCount({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[#666]">{count} {label}</span>
    </div>
  );
}
