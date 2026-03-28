import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, FolderKanban, Bot, Sparkles, Clock, CheckSquare } from "lucide-react";
import { useClient } from "../lib/context";

export function HomePage() {
  const client = useClient();
  const [greeting, setGreeting] = useState("");
  const [recentMessages, setRecentMessages] = useState<Array<{ role: string; content: string; timestamp: number }>>([]);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");

    client.history(5).then((r) => setRecentMessages(r.messages)).catch(() => {});
  }, [client]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mb-10">
        <div className="flex items-center gap-4 mb-1">
          <div className="w-12 h-12 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
            <Sparkles size={22} className="text-[#c8a050]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[#e5e5e5]">{greeting}</h1>
            <p className="text-[#555] text-sm">{today}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-[#c8a050] rounded-full" />
            <h2 className="text-sm font-semibold text-[#888] uppercase tracking-wide">Recent</h2>
          </div>
          <div className="bg-[#141414] rounded-xl border border-[#1a1a1a] p-5">
            {recentMessages.length === 0 ? (
              <p className="text-[#555] text-sm text-center py-6">No conversations yet</p>
            ) : (
              <div className="space-y-3">
                {recentMessages.filter(m => m.role === "user").slice(-3).map((m, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Clock size={14} className="text-[#444] mt-0.5 shrink-0" />
                    <p className="text-sm text-[#aaa] truncate">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            <Link to="/chat" className="block text-[#c8a050] text-xs font-medium mt-4 hover:text-[#d4ad5e]">
              Open chat →
            </Link>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-[#c8a050] rounded-full" />
            <h2 className="text-sm font-semibold text-[#888] uppercase tracking-wide">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { to: "/chat", icon: MessageCircle, label: "Chat" },
              { to: "/projects", icon: FolderKanban, label: "Projects" },
              { to: "/agents", icon: Bot, label: "Agents" },
              { to: "/chat", icon: CheckSquare, label: "Tasks" },
            ].map(({ to, icon: Icon, label }) => (
              <Link
                key={label}
                to={to}
                className="bg-[#141414] rounded-xl border border-[#1a1a1a] p-4 flex flex-col items-center gap-2 hover:border-[#c8a050]/30 transition-all"
              >
                <Icon size={22} className="text-[#c8a050]" />
                <span className="text-xs font-medium text-[#888]">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <ChatInput />
    </div>
  );
}

function ChatInput() {
  const [value, setValue] = useState("");
  const client = useClient();
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || sending) return;
    setSending(true);
    try {
      await client.ask(value);
    } catch {
      // ignore
    } finally {
      setValue("");
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8">
      <div className="relative">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask Rue anything..."
          className="w-full px-5 py-4 bg-[#141414] rounded-2xl border border-[#1a1a1a] text-[#e5e5e5] placeholder-[#555] focus:outline-none focus:ring-2 focus:ring-[#c8a050]/30 focus:border-[#c8a050]/50"
        />
        <button
          type="submit"
          disabled={sending || !value.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-[#c8a050] hover:bg-[#d4ad5e] disabled:bg-[#333] rounded-xl flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 text-[#0a0a0a]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
        </button>
      </div>
    </form>
  );
}
