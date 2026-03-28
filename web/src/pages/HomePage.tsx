import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, FolderKanban, Bot, CheckSquare, ArrowRight } from "lucide-react";
import { api } from "../lib/api";

export function HomePage() {
  const [greeting, setGreeting] = useState("");
  const [recent, setRecent] = useState<Array<{ content: string; timestamp: number }>>([]);

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
    api.history(8).then((r) => setRecent(
      r.messages.filter((m) => m.role === "user").slice(-3)
    )).catch(() => {});
  }, []);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      {/* Greeting */}
      <div className="mb-12">
        <h1 className="text-2xl font-semibold text-text-primary">{greeting}</h1>
        <p className="text-sm text-text-muted mt-1">{today}</p>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-2 gap-8 mb-12">
        {/* Recent */}
        <div>
          <SectionLabel>Recent</SectionLabel>
          <div className="bg-surface rounded-xl border border-border p-5">
            {recent.length === 0 ? (
              <p className="text-text-muted text-sm py-6 text-center">No conversations yet</p>
            ) : (
              <div className="space-y-3">
                {recent.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 group">
                    <div className="w-1 h-1 rounded-full bg-accent/40 mt-2 shrink-0" />
                    <p className="text-sm text-text-secondary group-hover:text-text-primary transition-colors duration-150 truncate">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            <Link to="/chat" className="flex items-center gap-1.5 text-accent hover:text-accent-hover text-xs font-medium mt-5 transition-colors duration-150">
              View all <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <SectionLabel>Quick actions</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {[
              { to: "/chat", icon: MessageCircle, label: "Chat" },
              { to: "/projects", icon: FolderKanban, label: "Projects" },
              { to: "/agents", icon: Bot, label: "Agents" },
              { to: "/projects", icon: CheckSquare, label: "Tasks" },
            ].map(({ to, icon: Icon, label }) => (
              <Link
                key={label}
                to={to}
                className="bg-surface rounded-xl border border-border p-5 flex flex-col items-center gap-3 hover:border-accent/30 transition-colors duration-150"
              >
                <Icon size={20} className="text-text-muted" strokeWidth={1.5} />
                <span className="text-xs font-medium text-text-secondary">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Chat input */}
      <div>
        <Link to="/chat" className="block">
          <div className="relative group">
            <div className="w-full px-6 py-4 bg-surface rounded-xl border border-border text-text-muted text-sm cursor-pointer group-hover:border-accent/20 transition-colors duration-150">
              Message Rue...
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <ArrowRight size={14} className="text-bg" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] font-medium text-text-muted uppercase tracking-widest mb-3">{children}</h2>
  );
}
