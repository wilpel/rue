import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, User, Clock } from "lucide-react";
import { api, type ProjectDetail, type Task } from "../lib/api";

const COLUMNS = [
  { key: "todo", label: "Todo", color: "#888" },
  { key: "in-progress", label: "In Progress", color: "#c8a050" },
  { key: "done", label: "Done", color: "#4ade80" },
] as const;

export function ProjectDetailPage() {
  const { name } = useParams<{ name: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (!name) return;
    api.project(name)
      .then(setProject)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [name]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-[#888] animate-pulse">Loading project...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-[#f87171]">{error ?? "Project not found"}</p>
        <Link to="/projects" className="text-[#c8a050] hover:text-[#d4ad5e] text-sm">Back to projects</Link>
      </div>
    );
  }

  const tasksByStatus: Record<string, Task[]> = { todo: [], "in-progress": [], done: [] };
  for (const task of project.tasks) {
    const status = task.status ?? "todo";
    if (status in tasksByStatus) tasksByStatus[status].push(task);
    else tasksByStatus.todo.push(task);
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-[#1a1a1a] bg-[#0e0e0e] px-6 py-4">
        <div className="flex items-center gap-4">
          <Link to="/projects" className="text-[#888] hover:text-[#e5e5e5] transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-[#e5e5e5]">{project.name}</h1>
            <p className="text-sm text-[#888]">{project.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#666]">Max agents: {project.maxAgents}</span>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#c8a050] hover:bg-[#d4ad5e] text-[#0a0a0a] text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              Add Task
            </button>
          </div>
        </div>
      </div>

      {/* Add task form */}
      {showAddForm && (
        <div className="border-b border-[#1a1a1a] bg-[#0e0e0e] px-6 py-3">
          <div className="flex gap-3 max-w-lg">
            <input
              placeholder="Task title..."
              className="flex-1 px-3 py-2 bg-[#141414] rounded-lg border border-[#1a1a1a] text-[#e5e5e5] placeholder-[#555] text-sm focus:outline-none focus:ring-1 focus:ring-[#c8a050]/30"
            />
            <button className="px-4 py-2 bg-[#c8a050] hover:bg-[#d4ad5e] text-[#0a0a0a] text-sm font-medium rounded-lg transition-colors">
              Create
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-[#1a1a1a] text-[#888] text-sm rounded-lg hover:text-[#e5e5e5] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 min-h-full">
          {COLUMNS.map(({ key, label, color }) => (
            <div key={key} className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-4 px-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <h3 className="text-sm font-semibold text-[#888] uppercase tracking-wide">{label}</h3>
                <span className="text-xs text-[#555] ml-auto">{tasksByStatus[key].length}</span>
              </div>
              <div className="space-y-3">
                {tasksByStatus[key].length === 0 ? (
                  <div className="bg-[#141414] rounded-lg border border-dashed border-[#222] p-6 text-center">
                    <p className="text-xs text-[#444]">No tasks</p>
                  </div>
                ) : (
                  tasksByStatus[key].map((task, i) => (
                    <TaskCard key={task.filename ?? i} task={task} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  return (
    <div className="bg-[#141414] rounded-lg border border-[#1a1a1a] p-4 hover:border-[#2a2a2a] transition-colors">
      <h4 className="text-sm font-medium text-[#e5e5e5] mb-2">{task.title}</h4>
      <div className="flex flex-wrap gap-2">
        {task.agent && (
          <span className="flex items-center gap-1 text-xs text-[#c8a050]">
            <User size={10} />
            {task.agent}
          </span>
        )}
        {task.started && (
          <span className="flex items-center gap-1 text-xs text-[#666]">
            <Clock size={10} />
            {task.started}
          </span>
        )}
        {task.completed && (
          <span className="flex items-center gap-1 text-xs text-[#4ade80]">
            <Clock size={10} />
            {task.completed}
          </span>
        )}
      </div>
    </div>
  );
}
