import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, User, Clock, LayoutGrid, FileText } from "lucide-react";
import { api, type ProjectDetail, type Task, type ProjectDoc } from "../lib/api";

type Tab = "board" | "docs";

const COLUMNS = [
  { key: "todo", label: "Todo", color: "#888" },
  { key: "in-progress", label: "In Progress", color: "#c8a050" },
  { key: "done", label: "Done", color: "#4ade80" },
] as const;

export function ProjectDetailPage() {
  const { name } = useParams<{ name: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (!name) return;
    Promise.all([
      api.project(name),
      api.projectDocs(name),
    ])
      .then(([proj, d]) => { setProject(proj); setDocs(d); })
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

  const activeDoc = docs.find((d) => d.path === selectedDoc) ?? docs[0] ?? null;

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
            {tab === "board" && (
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#c8a050] hover:bg-[#d4ad5e] text-[#0a0a0a] text-sm font-medium rounded-lg transition-colors"
              >
                <Plus size={16} />
                Add Task
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          <button
            onClick={() => setTab("board")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === "board"
                ? "bg-[#1a1a1a] text-[#c8a050]"
                : "text-[#666] hover:text-[#888]"
            }`}
          >
            <LayoutGrid size={14} />
            Board
          </button>
          <button
            onClick={() => setTab("docs")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === "docs"
                ? "bg-[#1a1a1a] text-[#c8a050]"
                : "text-[#666] hover:text-[#888]"
            }`}
          >
            <FileText size={14} />
            Docs
            <span className="text-xs text-[#555]">{docs.length}</span>
          </button>
        </div>
      </div>

      {/* Add task form */}
      {showAddForm && tab === "board" && (
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

      {/* Tab content */}
      {tab === "board" && (
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
      )}

      {tab === "docs" && (
        <div className="flex-1 flex overflow-hidden">
          {/* Doc sidebar */}
          <div className="w-56 border-r border-[#1a1a1a] bg-[#0a0a0a] overflow-y-auto p-3">
            {docs.length === 0 ? (
              <p className="text-xs text-[#444] p-2">No docs yet</p>
            ) : (
              <div className="space-y-1">
                {docs.map((doc) => (
                  <button
                    key={doc.path}
                    onClick={() => setSelectedDoc(doc.path)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      (selectedDoc ?? docs[0]?.path) === doc.path
                        ? "bg-[#1a1a1a] text-[#c8a050]"
                        : "text-[#888] hover:bg-[#141414] hover:text-[#e5e5e5]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText size={12} />
                      <span className="truncate">{doc.name}</span>
                    </div>
                    <p className="text-xs text-[#555] mt-0.5 truncate">{doc.path}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Doc content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeDoc ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <FileText size={16} className="text-[#c8a050]" />
                  <h2 className="text-sm font-semibold text-[#e5e5e5]">{activeDoc.name}</h2>
                  <span className="text-xs text-[#555]">{activeDoc.path}</span>
                </div>
                <div className="bg-[#141414] rounded-lg border border-[#1a1a1a] p-6">
                  <pre className="whitespace-pre-wrap text-sm text-[#ccc] font-mono leading-relaxed">
                    {activeDoc.content}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-[#444]">Select a document</p>
              </div>
            )}
          </div>
        </div>
      )}
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
