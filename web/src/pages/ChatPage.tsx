import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useClient } from "../lib/context";

interface Message { id: string; role: string; content: string; timestamp: number; isStreaming?: boolean; }

export function ChatPage() {
  const client = useClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client.history(30).then(r => {
      setMessages(r.messages.filter(m => m.role !== "agent-event").map(m => ({
        id: m.id, role: m.role, content: m.content, timestamp: m.timestamp,
      })));
    }).catch(() => {});
  }, [client]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input; setInput("");
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text, timestamp: Date.now() };
    const aId = `a-${Date.now()}`;
    const aMsg: Message = { id: aId, role: "assistant", content: "", timestamp: Date.now(), isStreaming: true };
    setMessages(p => [...p, userMsg, aMsg]); setSending(true);
    try {
      const result = await client.ask(text, {
        onStream: (chunk) => setMessages(p => p.map(m => m.id === aId ? { ...m, content: m.content + chunk } : m)),
      });
      setMessages(p => p.map(m => m.id === aId ? { ...m, content: m.content || result.output, isStreaming: false } : m));
    } catch (err) {
      setMessages(p => p.map(m => m.id === aId ? { ...m, content: `Error: ${err}`, isStreaming: false } : m));
    } finally { setSending(false); }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">
          {messages.length === 0 && (
            <div className="text-center py-32">
              <p className="text-dim text-sm">Send a message to start</p>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-amber text-bg text-sm px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[70%] font-medium">
                    {msg.content}
                  </div>
                </div>
              ) : msg.role === "assistant" ? (
                <div>
                  <span className="text-[10px] font-semibold text-amber/50 uppercase tracking-wider mb-1 block">rue</span>
                  <div className="bg-raised border border-line text-white text-sm px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%] leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                    {msg.isStreaming && <span className="inline-block w-0.5 h-4 bg-amber ml-0.5 animate-pulse" />}
                  </div>
                </div>
              ) : (
                <p className="text-dim text-xs italic text-center">{msg.content}</p>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-line p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Message..."
            className="flex-1 h-12 px-4 bg-raised border border-line rounded-xl text-white text-sm placeholder:text-dim focus:outline-none focus:border-line-strong transition-colors" />
          <button type="submit" disabled={sending || !input.trim()}
            className="h-12 px-5 bg-amber hover:bg-amber/90 disabled:bg-elevated disabled:text-dim text-bg font-medium rounded-xl transition-colors">
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
