import { useTasks } from "../lib/hooks";

export function ProjectsPage() {
  const { tasks, loading } = useTasks();

  const pending = tasks.filter(t => t.status === "pending");
  const active = tasks.filter(t => t.status === "active");
  const completed = tasks.filter(t => t.status === "completed");

  if (loading) return <div className="h-full flex items-center justify-center"><p className="text-muted text-sm">Loading...</p></div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-text tracking-tight mb-6">Tasks</h1>

        <div className="grid grid-cols-3 gap-6">
          <Column title="Pending" count={pending.length} color="text-secondary" tasks={pending} />
          <Column title="Active" count={active.length} color="text-accent" tasks={active} />
          <Column title="Completed" count={completed.length} color="text-green" tasks={completed} />
        </div>
      </div>
    </div>
  );
}

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  due_at: number | null;
}

function Column({ title, count, color, tasks }: { title: string; count: number; color: string; tasks: TaskItem[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className={`text-[11px] font-semibold uppercase tracking-wider ${color}`}>{title}</h2>
        <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded">{count}</span>
      </div>
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-line text-center">
            <p className="text-[11px] text-muted/40">None</p>
          </div>
        ) : tasks.map(t => (
          <div key={t.id} className="p-3 rounded-lg border border-line bg-surface">
            <p className="text-sm font-medium text-text mb-0.5">{t.title}</p>
            {t.description && <p className="text-xs text-secondary mb-1.5 line-clamp-2">{t.description}</p>}
            <div className="flex gap-2 text-[10px] text-muted">
              <span>{t.type}</span>
              <span className={t.priority === "urgent" ? "text-red" : t.priority === "high" ? "text-accent" : ""}>{t.priority}</span>
              {t.due_at && <span>Due: {new Date(t.due_at).toLocaleDateString()}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
