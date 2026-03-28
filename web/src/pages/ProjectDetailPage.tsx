import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, User, Clock, LayoutGrid, FileText } from "lucide-react";
import { api, type ProjectDetail, type Task, type ProjectDoc } from "../lib/api";

type Tab = "board" | "docs";
const COLUMNS = [
  { key: "todo", label: "Todo", dot: "bg-text-muted/30" },
  { key: "in-progress", label: "In Progress", dot: "bg-accent" },
  { key: "done", label: "Done", dot: "bg-success" },
] as const;

export function ProjectDetailPage() {
  const { name } = useParams<{ name: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    Promise.all([api.project(name), api.projectDocs(name)])
      .then(([p, d]) => { setProject(p); setDocs(d); if (d.length > 0) setSelectedDoc(d[0].path); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [name]);

  if (loading) return <div className="h-screen flex items-center justify-center"><div className="w-2.5 h-2.5 rounded-full bg-accent/40 animate-breathe" /></div>;
  if (error || !project) return (
    <div className="h-screen flex flex-col items-center justify-center gap-3">
      <p className="text-error text-sm">{error ?? "Not found"}</p>
      <Link to="/projects" className="text-accent text-xs hover:text-accent-hover transition-colors">Back</Link>
    </div>
  );

  const tasksByStatus: Record<string, Task[]> = { todo: [], "in-progress": [], done: [] };
  for (const t of project.tasks) { const s = t.status ?? "todo"; if (s in tasksByStatus) tasksByStatus[s].push(t); else tasksByStatus.todo.push(t); }
  const activeDoc = docs.find(d => d.path === selectedDoc) ?? docs[0] ?? null;

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-glass-border glass px-6 py-4">
        <div className="flex items-center gap-4">
          <Link to="/projects" className="text-text-muted hover:text-text-primary transition-colors"><ArrowLeft size={18} /></Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-text-primary">{project.name}</h1>
            <p className="text-xs text-text-muted truncate">{project.description}</p>
          </div>
          <span className="text-[10px] text-text-muted font-mono glass px-2 py-1 rounded-lg">max {project.maxAgents}</span>
          {tab === "board" && (
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-bg text-xs font-semibold rounded-lg transition-colors">
              <Plus size={14} /> Add Task
            </button>
          )}
        </div>
        <div className="flex gap-1 mt-3">
          {(["board", "docs"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                tab === t ? "bg-accent-glow text-accent" : "text-text-muted hover:text-text-secondary"
              }`}>
              {t === "board" ? <LayoutGrid size={12} /> : <FileText size={12} />}
              {t === "board" ? "Board" : `Docs (${docs.length})`}
            </button>
          ))}
        </div>
      </div>

      {tab === "board" && (
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-5 min-h-full">
            {COLUMNS.map(({ key, label, dot }) => (
              <div key={key} className="flex-1 min-w-[260px]">
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.1em]">{label}</h3>
                  <span className="text-[10px] text-text-muted/50 ml-auto font-mono">{tasksByStatus[key].length}</span>
                </div>
                <div className="space-y-2.5">
                  {tasksByStatus[key].length === 0 ? (
                    <div className="glass rounded-2xl border-dashed p-8 text-center"><p className="text-[11px] text-text-muted/30">No tasks</p></div>
                  ) : tasksByStatus[key].map((task, i) => (
                    <div key={task.filename ?? i} className="glass glass-hover rounded-2xl p-4 transition-all duration-200">
                      <h4 className="text-xs font-medium text-text-primary mb-1">{task.title}</h4>
                      {task.description && <p className="text-[11px] text-text-muted leading-relaxed mb-2 line-clamp-3">{task.description}</p>}
                      <div className="flex flex-wrap gap-2">
                        {task.agent && <span className="flex items-center gap-1 text-[10px] text-accent font-mono"><User size={9} />{task.agent}</span>}
                        {task.started && <span className="flex items-center gap-1 text-[10px] text-text-muted font-mono"><Clock size={9} />{new Date(task.started).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "docs" && (
        <div className="flex-1 flex overflow-hidden">
          <div className="w-48 border-r border-glass-border bg-bg/50 overflow-y-auto p-2.5">
            {docs.map(doc => (
              <button key={doc.path} onClick={() => setSelectedDoc(doc.path)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all mb-0.5 ${
                  selectedDoc === doc.path ? "bg-accent-glow text-accent" : "text-text-muted hover:bg-glass-hover hover:text-text-secondary"
                }`}>
                <div className="flex items-center gap-2"><FileText size={11} /><span className="truncate">{doc.name}</span></div>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {activeDoc ? (
              <div className="max-w-3xl animate-fade-up">
                <div className="flex items-center gap-2 mb-5">
                  <FileText size={14} className="text-accent/50" />
                  <h2 className="text-xs font-semibold text-text-secondary">{activeDoc.name}</h2>
                  <span className="text-[10px] text-text-muted font-mono">{activeDoc.path}</span>
                </div>
                <div className="glass rounded-2xl p-6">
                  <pre className="whitespace-pre-wrap text-xs text-text-secondary font-mono leading-relaxed">{activeDoc.content}</pre>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full"><p className="text-text-muted/30 text-xs">Select a document</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
