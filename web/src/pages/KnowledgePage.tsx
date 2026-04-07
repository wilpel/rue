import { useState } from "react";
import { useKBPages } from "../lib/hooks";
import { BookOpen, Search, ChevronRight } from "lucide-react";

export default function KnowledgePage() {
  const { pages, loading } = useKBPages();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = search
    ? pages.filter(p => p.path.includes(search.toLowerCase()) || p.title.toLowerCase().includes(search.toLowerCase()) || p.content.toLowerCase().includes(search.toLowerCase()))
    : pages;

  // Group by folder
  const grouped = new Map<string, typeof pages>();
  for (const p of filtered) {
    const parts = p.path.split("/");
    const folder = parts.length > 1 ? parts[0] : "(root)";
    if (!grouped.has(folder)) grouped.set(folder, []);
    grouped.get(folder)!.push(p);
  }

  const selectedPage = pages.find(p => p.path === selected);

  return (
    <div className="flex h-full">
      {/* Sidebar list */}
      <div className="w-72 border-r border-line overflow-y-auto p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-accent"><BookOpen size={18} /></span>
          <h2 className="text-lg font-semibold text-text">Knowledge Base</h2>
        </div>

        <div className="relative mb-3">
          <span className="absolute left-3 top-2.5 text-muted"><Search size={14} /></span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pages..."
            className="w-full bg-surface border border-line rounded-lg pl-8 pr-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/50"
          />
        </div>

        {loading ? (
          <p className="text-muted text-sm">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted text-sm">No pages found.</p>
        ) : (
          [...grouped.entries()].map(([folder, items]) => (
            <div key={folder} className="mb-3">
              <p className="text-xs text-muted uppercase tracking-wider mb-1 px-1">{folder}</p>
              {items.map(p => (
                <button
                  key={p.path}
                  onClick={() => setSelected(p.path)}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-1 transition-colors ${
                    selected === p.path ? "bg-accent-soft text-accent" : "text-secondary hover:text-text hover:bg-hover"
                  }`}
                >
                  <span className="text-muted"><ChevronRight size={12} /></span>
                  {p.title}
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedPage ? (
          <div>
            <h1 className="text-2xl font-semibold text-text mb-1">{selectedPage.title}</h1>
            <div className="flex gap-2 mb-4">
              {(selectedPage.tags as string[]).map(t => (
                <span key={t} className="bg-accent-soft text-accent text-xs px-2 py-0.5 rounded-full">{t}</span>
              ))}
              <span className="text-muted text-xs">Updated: {selectedPage.updated_at}</span>
            </div>
            <div className="prose prose-invert max-w-none text-text/90 whitespace-pre-wrap font-body text-sm leading-relaxed">
              {selectedPage.content}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted">
            <p>Select a page to view</p>
          </div>
        )}
      </div>
    </div>
  );
}
