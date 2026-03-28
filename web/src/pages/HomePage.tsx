import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, FolderKanban, Bot, CheckSquare, Sparkles, ArrowRight } from "lucide-react";
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
      <div className="mb-12 animate-fade-in">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <Sparkles size={18} className="text-gold" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text">{greeting}</h1>
            <p className="text-xs text-text-muted mt-0.5">{today}</p>
          </div>
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-2 gap-8 mb-12">
        {/* Recent */}
        <div className="animate-fade-in stagger-1">
          <SectionLabel>Recent</SectionLabel>
          <div className="bg-surface-1 rounded-xl border border-border-subtle p-5">
            {recent.length === 0 ? (
              <p className="text-text-muted text-sm py-6 text-center">No conversations yet</p>
            ) : (
              <div className="space-y-3">
                {recent.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 group">
                    <div className="w-1 h-1 rounded-full bg-gold/40 mt-2 shrink-0" />
                    <p className="text-sm text-text-secondary group-hover:text-text transition-colors truncate">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            <Link to="/chat" className="flex items-center gap-1.5 text-gold/70 hover:text-gold text-xs font-medium mt-5 transition-colors">
              Open chat <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Quick actions */}
        <div className="animate-fade-in stagger-2">
          <SectionLabel>Quick actions</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {[
              { to: "/chat", icon: MessageCircle, label: "Chat" },
              { to: "/projects", icon: FolderKanban, label: "Projects" },
              { to: "/agents", icon: Bot, label: "Agents" },
              { to: "/projects", icon: CheckSquare, label: "Tasks" },
            ].map(({ to, icon: Icon, label }, i) => (
              <Link
                key={label}
                to={to}
                className={`bg-surface-1 rounded-xl border border-border-subtle p-5 flex flex-col items-center gap-3 hover:border-gold/20 hover:bg-surface-2 transition-all duration-300 animate-fade-in stagger-${i + 2}`}
              >
                <Icon size={20} className="text-text-muted" strokeWidth={1.5} />
                <span className="text-xs font-medium text-text-secondary">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Chat input */}
      <div className="animate-fade-in stagger-4">
        <div className="relative group">
          <div className="absolute inset-0 rounded-2xl bg-gold/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <input
            readOnly
            placeholder="Ask Rue anything..."
            onClick={() => window.location.href = '/chat'}
            className="w-full px-6 py-4 bg-surface-1 rounded-2xl border border-border-subtle text-text placeholder-text-muted text-sm cursor-pointer hover:border-gold/20 transition-all duration-300 focus:outline-none relative"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center relative">
            <ArrowRight size={14} className="text-gold" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-0.5 h-4 bg-gold rounded-full" />
      <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.15em]">{children}</h2>
    </div>
  );
}
