import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FolderKanban, Plus, User, Clock, FileText } from "lucide-react";
import { api, type ProjectSummary, type ProjectDetail, type Task, type ProjectDoc } from "../lib/api";

export function ProjectsPage() {
  const { "*": selectedName } = useParams();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.projects().then(setProjects).catch(() => {}).finally(() => setLoading(false)); }, []);

  const selected = selectedName || (projects.length === 1 ? projects[0].name : null);

  return (
    <div className="h-full flex">
      {/* Project list */}
      <div className={`${selected ? "w-72" : "flex-1 max-w-2xl mx-auto"} shrink-0 border-r border-line flex flex-col transition-all`}>
        <div className="h-12 flex items-center justify-between px-4 border-b border-line shrink-0">
          <h1 className="text-sm font-semibold text-text">Projects</h1>
          <button className="flex items-center gap-1 px-2.5 py-1 bg-accent text-bg text-[11px] font-semibold rounded-md hover:brightness-110 transition-all">
            <Plus size={12} /> New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? <p className="text-muted text-xs text-center mt-8">Loading...</p> : projects.length === 0 ? (
            <div className="text-center mt-16">
              <FolderKanban size={28} className="mx-auto text-muted/30 mb-2" strokeWidth={1} />
              <p className="text-muted text-xs">No projects</p>
            </div>
          ) : projects.map(p => (
            <button key={p.name} onClick={() => navigate(`/projects/${p.name}`)}
              className={`w-full text-left p-3 rounded-lg mb-1 transition-colors ${selected === p.name ? "bg-hover" : "hover:bg-surface"}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-xs font-medium text-text truncate">{p.name}</h3>
                <span className="text-[9px] px-1.5 py-0.5 bg-accent-soft text-accent rounded-full shrink-0">{p.status}</span>
              </div>
              <p className="text-[11px] text-muted truncate">{p.description}</p>
              <div className="flex gap-3 mt-1.5 text-[10px] text-muted">
                <span>{p.taskCounts.todo} todo</span>
                <span className="text-accent">{p.taskCounts["in-progress"]} active</span>
                <span className="text-green">{p.taskCounts.done} done</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selected ? (
        <ProjectDetailPanel name={selected} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted text-sm">Select a project</p>
        </div>
      )}
    </div>
  );
}

function ProjectDetailPanel({ name }: { name: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  const [tab, setTab] = useState<"board" | "docs">("board");
  const [selDoc, setSelDoc] = useState<string | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  useEffect(() => {
    Promise.all([api.project(name), api.projectDocs(name)])
      .then(([p, d]) => { setProject(p); setDocs(d); if (d.length) setSelDoc(d[0].path); })
      .catch(() => {});
  }, [name]);

  if (!project) return <div className="flex-1 flex items-center justify-center"><p className="text-muted text-sm">Loading...</p></div>;

  const by: Record<string, Task[]> = { todo: [], "in-progress": [], done: [] };
  for (const t of project.tasks) (by[t.status ?? "todo"] ?? by.todo).push(t);
  const doc = docs.find(d => d.path === selDoc) ?? docs[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-12 flex items-center gap-3 px-4 border-b border-line shrink-0">
        <h2 className="text-sm font-semibold text-text">{project.name}</h2>
        <div className="flex gap-0.5 ml-4">
          {(["board","docs"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${tab === t ? "bg-hover text-text" : "text-muted hover:text-secondary"}`}>
              {t === "board" ? "Board" : `Docs (${docs.length})`}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAddTask(!showAddTask)} className="ml-auto flex items-center gap-1 px-2.5 py-1 bg-accent text-bg text-[11px] font-semibold rounded-md hover:brightness-110 transition-all">
          <Plus size={12} /> Task
        </button>
      </div>

      {showAddTask && (
        <div className="border-b border-line px-4 py-3 flex gap-2">
          <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Task title..."
            className="flex-1 h-9 px-3 bg-surface border border-line rounded-lg text-text text-sm placeholder:text-muted focus:outline-none focus:border-accent/30" />
          <button onClick={async () => {
            if (!newTaskTitle.trim()) return;
            await fetch(`/api/projects/${name}/tasks`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({title: newTaskTitle}) });
            setNewTaskTitle(""); setShowAddTask(false);
            // Reload project
            const [p, d] = await Promise.all([api.project(name!), api.projectDocs(name!)]);
            setProject(p); setDocs(d);
          }} className="h-9 px-4 bg-accent text-bg text-xs font-semibold rounded-lg hover:brightness-110">Create</button>
          <button onClick={() => { setShowAddTask(false); setNewTaskTitle(""); }} className="h-9 px-3 text-muted text-xs hover:text-secondary">Cancel</button>
        </div>
      )}

      {tab === "board" ? (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-3 h-full">
            {[
              { key: "todo", label: "Todo", dot: "bg-muted" },
              { key: "in-progress", label: "In Progress", dot: "bg-accent" },
              { key: "done", label: "Done", dot: "bg-green" },
            ].map(({ key, label, dot }) => (
              <div key={key} className="w-[260px] shrink-0 flex flex-col">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">{label}</span>
                  <span className="text-[10px] text-muted/50 ml-auto font-mono">{by[key].length}</span>
                </div>
                <div className="flex-1 space-y-2">
                  {by[key].length === 0 ? (
                    <div className="border border-dashed border-line rounded-lg p-6 text-center"><p className="text-[10px] text-muted/30">Empty</p></div>
                  ) : by[key].map((t, i) => (
                    <div key={t.filename ?? i} className="p-3 rounded-lg border border-line bg-surface hover:border-accent/15 transition-colors">
                      <p className="text-xs font-medium text-text mb-0.5">{t.title}</p>
                      {t.description && <p className="text-[11px] text-muted leading-relaxed mb-1.5 line-clamp-3">{t.description}</p>}
                      <div className="flex gap-2">
                        {t.agent && t.agent !== "null" && <span className="text-[9px] text-accent font-mono flex items-center gap-1"><User size={8}/>{t.agent}</span>}
                        {t.started && t.started !== "null" && !isNaN(new Date(t.started).getTime()) && <span className="text-[9px] text-muted font-mono flex items-center gap-1"><Clock size={8}/>{new Date(t.started).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <div className="w-40 border-r border-line overflow-y-auto p-1.5">
            {docs.map(d => (
              <button key={d.path} onClick={() => setSelDoc(d.path)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-[11px] mb-0.5 transition-colors ${selDoc === d.path ? "bg-hover text-text" : "text-muted hover:text-secondary"}`}>
                <div className="flex items-center gap-1.5"><FileText size={10}/><span className="truncate">{d.name}</span></div>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {doc ? (
              <div className="max-w-3xl">
                <p className="text-[11px] text-muted mb-3 font-mono">{doc.path}</p>
                <pre className="text-xs text-secondary font-mono leading-relaxed whitespace-pre-wrap p-4 rounded-lg border border-line bg-surface">{doc.content}</pre>
              </div>
            ) : <p className="text-muted text-xs mt-8 text-center">Select a doc</p>}
          </div>
        </div>
      )}
    </div>
  );
}
