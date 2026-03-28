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
          <div className="w-12 h-12 rounded-full bg-amber-200 flex items-center justify-center">
            <Sparkles size={22} className="text-amber-700" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-stone-800">{greeting}</h1>
            <p className="text-stone-400 text-sm">{today}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-amber-400 rounded-full" />
            <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">Recent</h2>
          </div>
          <div className="bg-white rounded-xl border border-amber-100 p-5 shadow-sm">
            {recentMessages.length === 0 ? (
              <p className="text-stone-400 text-sm text-center py-6">No conversations yet</p>
            ) : (
              <div className="space-y-3">
                {recentMessages.filter(m => m.role === "user").slice(-3).map((m, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Clock size={14} className="text-stone-300 mt-0.5 shrink-0" />
                    <p className="text-sm text-stone-600 truncate">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            <Link to="/chat" className="block text-amber-600 text-xs font-medium mt-4 hover:text-amber-700">
              Open chat →
            </Link>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-amber-400 rounded-full" />
            <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">Quick Actions</h2>
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
                className="bg-white rounded-xl border border-amber-100 p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:border-amber-200 transition-all"
              >
                <Icon size={22} className="text-amber-600" />
                <span className="text-xs font-medium text-stone-600">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Chat input at bottom */}
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
          className="w-full px-5 py-4 bg-white rounded-2xl border border-amber-100 shadow-sm text-stone-700 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-200"
        />
        <button
          type="submit"
          disabled={sending || !value.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-amber-500 hover:bg-amber-600 disabled:bg-stone-200 rounded-xl flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
        </button>
      </div>
    </form>
  );
}
