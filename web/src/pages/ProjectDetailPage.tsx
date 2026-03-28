import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, User, Clock, LayoutGrid, FileText } from "lucide-react";
import { api, type ProjectDetail, type Task, type ProjectDoc } from "../lib/api";

type Tab = "board" | "docs";
const COLS = [
  { key: "todo", label: "Todo", dot: "bg-dim" },
  { key: "in-progress", label: "In Progress", dot: "bg-amber" },
  { key: "done", label: "Done", dot: "bg-green" },
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

  if (loading) return <div className="h-full flex items-center justify-center"><p className="text-dim text-sm">Loading...</p></div>;
  if (error || !project) return (
    <div className="h-full flex flex-col items-center justify-center gap-2">
      <p className="text-red text-sm">{error ?? "Not found"}</p>
      <Link to="/projects" className="text-amber text-xs">Back</Link>
    </div>
  );

  const byStatus: Record<string, Task[]> = { todo: [], "in-progress": [], done: [] };
  for (const t of project.tasks) { const s = t.status ?? "todo"; (byStatus[s] ?? byStatus.todo).push(t); }
  const doc = docs.find(d => d.path === selectedDoc) ?? docs[0] ?? null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-line px-6 py-3">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/projects" className="text-dim hover:text-gray transition-colors"><ArrowLeft size={16} /></Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-white">{project.name}</h1>
            <p className="text-xs text-dim truncate">{project.description}</p>
          </div>
          <span className="text-[10px] text-dim font-code bg-elevated px-2 py-1 rounded">max {project.maxAgents}</span>
          {tab === "board" && (
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-amber text-bg text-xs font-semibold rounded-lg hover:bg-amber/90 transition-colors">
              <Plus size={14} /> Add Task
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {(["board", "docs"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === t ? "bg-elevated text-white" : "text-dim hover:text-gray"
              }`}>
              {t === "board" ? <LayoutGrid size={12} /> : <FileText size={12} />}
              {t === "board" ? "Board" : `Docs (${docs.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Board */}
      {tab === "board" && (
        <div className="flex-1 overflow-x-auto p-5">
          <div className="flex gap-4 h-full">
            {COLS.map(({ key, label, dot }) => (
              <div key={key} className="flex-1 min-w-[250px] flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  <span className="text-[11px] font-semibold text-dim uppercase tracking-wider">{label}</span>
                  <span className="text-[10px] text-dim/50 ml-auto font-code">{byStatus[key].length}</span>
                </div>
                <div className="space-y-2 flex-1">
                  {byStatus[key].length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line p-6 text-center">
                      <p className="text-[11px] text-dim/40">Empty</p>
                    </div>
                  ) : byStatus[key].map((task, i) => (
                    <div key={task.filename ?? i} className="p-3 rounded-xl border border-line bg-raised hover:border-line-strong transition-colors">
                      <h4 className="text-xs font-medium text-white mb-0.5">{task.title}</h4>
                      {task.description && <p className="text-[11px] text-dim leading-relaxed mb-2 line-clamp-2">{task.description}</p>}
                      <div className="flex gap-2">
                        {task.agent && <span className="flex items-center gap-1 text-[10px] text-amber font-code"><User size={9} />{task.agent}</span>}
                        {task.started && <span className="flex items-center gap-1 text-[10px] text-dim font-code"><Clock size={9} />{new Date(task.started).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Docs */}
      {tab === "docs" && (
        <div className="flex-1 flex overflow-hidden">
          <div className="w-44 border-r border-line overflow-y-auto p-2">
            {docs.map(d => (
              <button key={d.path} onClick={() => setSelectedDoc(d.path)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs mb-0.5 transition-colors ${
                  selectedDoc === d.path ? "bg-elevated text-white" : "text-dim hover:text-gray hover:bg-raised"
                }`}>
                <div className="flex items-center gap-2"><FileText size={11} /><span className="truncate">{d.name}</span></div>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {doc ? (
              <div className="max-w-3xl">
                <h2 className="text-xs font-semibold text-gray mb-4">{doc.name} <span className="text-dim font-code font-normal ml-2">{doc.path}</span></h2>
                <div className="p-5 rounded-xl border border-line bg-raised">
                  <pre className="whitespace-pre-wrap text-xs text-gray font-code leading-relaxed">{doc.content}</pre>
                </div>
              </div>
            ) : (
              <p className="text-dim text-xs text-center mt-20">Select a document</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
