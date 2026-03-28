import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useClient } from "../lib/context";

interface Message {
  id: string;
  role: string;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export function ChatPage() {
  const client = useClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client.history(20).then((r) => {
      setMessages(r.messages.filter(m => m.role !== "agent-event").map(m => ({
        id: m.id, role: m.role, content: m.content, timestamp: m.timestamp,
      })));
    }).catch(() => {});
  }, [client]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input;
    setInput("");

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text, timestamp: Date.now() };
    const aId = `a-${Date.now()}`;
    const assistantMsg: Message = { id: aId, role: "assistant", content: "", timestamp: Date.now(), isStreaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setSending(true);

    try {
      const result = await client.ask(text, {
        onStream: (chunk) => {
          setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: m.content + chunk } : m));
        },
      });
      setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: m.content || result.output, isStreaming: false } : m));
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: `Error: ${err}`, isStreaming: false } : m));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-border-subtle px-6 py-3">
        <h1 className="text-sm font-semibold text-text-secondary">Chat</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-24">
              <div className="w-2 h-2 rounded-full bg-accent/40 mx-auto mb-4" />
              <p className="text-text-muted text-sm">Start a conversation with Rue</p>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[75%] ${
                msg.role === "user"
                  ? "bg-accent text-bg rounded-2xl rounded-br-md px-4 py-2.5"
                  : msg.role === "system"
                    ? "text-text-muted text-xs italic px-2 py-1"
                    : "bg-surface border border-border rounded-2xl rounded-bl-md px-4 py-2.5"
              }`}>
                {msg.role === "assistant" && (
                  <p className="text-[10px] font-semibold text-accent/50 uppercase tracking-wider mb-1.5">rue</p>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content || (msg.isStreaming ? "" : "")}
                </p>
                {msg.isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-accent rounded-sm ml-0.5 animate-pulse-accent" />
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border-subtle p-4">
        <div className="max-w-2xl mx-auto flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-3 bg-surface rounded-xl border border-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent/30 transition-colors duration-150"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-4 py-3 bg-accent hover:bg-accent-hover disabled:bg-surface-elevated disabled:text-text-muted text-bg font-medium rounded-xl transition-colors duration-150"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
