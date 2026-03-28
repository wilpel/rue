import { useEffect, useState } from "react";
import { useClient } from "../lib/context";
import { FolderKanban, Plus } from "lucide-react";

export function ProjectsPage() {
  const client = useClient();
  const [loading, setLoading] = useState(true);
  const [projectDetail, setProjectDetail] = useState<string>("");

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const result = await client.ask("Run the projects list skill and return the output. Use: node --import tsx/esm skills/projects/run.ts list", {
        onStream: () => {},
      });
      setProjectDetail(result.output);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-amber-100 bg-white/60 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-stone-700">Projects</h1>
        <button className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg transition-colors">
          <Plus size={16} />
          New Project
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-center py-20">
            <p className="text-stone-400 animate-pulse">Loading projects...</p>
          </div>
        ) : projectDetail ? (
          <div className="bg-white rounded-xl border border-amber-100 p-6 shadow-sm">
            <pre className="whitespace-pre-wrap text-sm text-stone-600 font-mono">{projectDetail}</pre>
          </div>
        ) : (
          <div className="text-center py-20">
            <FolderKanban size={48} className="mx-auto text-stone-200 mb-4" />
            <p className="text-stone-400 mb-2">No projects yet</p>
            <p className="text-stone-300 text-sm">Ask Rue to create one, or use the projects skill</p>
          </div>
        )}
      </div>
    </div>
  );
}
