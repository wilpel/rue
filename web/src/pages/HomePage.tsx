import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, FolderKanban, Bot, CheckSquare, ArrowRight, Sparkles } from "lucide-react";
import { api } from "../lib/api";

export function HomePage() {
  const [greeting, setGreeting] = useState("");
  const [recent, setRecent] = useState<Array<{ content: string }>>([]);

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
    api.history(8).then(r => setRecent(r.messages.filter((m: any) => m.role === "user").slice(-4))).catch(() => {});
  }, []);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="max-w-4xl mx-auto px-8 py-14">
      <div className="mb-14 animate-fade-up">
        <div className="flex items-center gap-4 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-accent-glow flex items-center justify-center glass">
            <Sparkles size={18} className="text-accent" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-text-primary tracking-tight">{greeting}</h1>
            <p className="text-sm text-text-muted mt-0.5">{today}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-14">
        <div className="animate-fade-up delay-1">
          <Label>Recent</Label>
          <div className="glass rounded-2xl p-5 min-h-[160px]">
            {recent.length === 0 ? (
              <p className="text-text-muted text-sm py-8 text-center">No conversations yet</p>
            ) : (
              <div className="space-y-3">
                {recent.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 group">
                    <div className="w-1 h-1 rounded-full bg-accent/40 shrink-0" />
                    <p className="text-sm text-text-secondary group-hover:text-text-primary transition-colors truncate">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            <Link to="/chat" className="flex items-center gap-1.5 text-accent/60 hover:text-accent text-xs font-medium mt-5 transition-colors">
              View all <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        <div className="animate-fade-up delay-2">
          <Label>Quick actions</Label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { to: "/chat", icon: MessageCircle, label: "Chat" },
              { to: "/projects", icon: FolderKanban, label: "Projects" },
              { to: "/agents", icon: Bot, label: "Agents" },
              { to: "/projects", icon: CheckSquare, label: "Tasks" },
            ].map(({ to, icon: Icon, label }) => (
              <Link key={label} to={to} className="glass glass-hover rounded-2xl p-5 flex flex-col items-center gap-3 transition-all duration-300 group">
                <Icon size={20} className="text-text-muted group-hover:text-accent transition-colors duration-300" strokeWidth={1.5} />
                <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="animate-fade-up delay-3">
        <Link to="/chat" className="block glass glass-hover rounded-2xl px-6 py-4 transition-all duration-300 group">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted group-hover:text-text-secondary transition-colors">Message Rue...</span>
            <div className="w-8 h-8 rounded-lg bg-accent/10 group-hover:bg-accent flex items-center justify-center transition-all duration-300">
              <ArrowRight size={14} className="text-accent group-hover:text-bg transition-colors" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

function Label({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.15em] mb-3">{children}</h2>
  );
}
