import { useEffect, useRef, useState } from "react";
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
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", timestamp: Date.now(), isStreaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setSending(true);

    try {
      const result = await client.ask(text, {
        onStream: (chunk) => {
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + chunk } : m));
        },
      });
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content || result.output, isStreaming: false } : m));
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${err}`, isStreaming: false } : m));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-[#1a1a1a] bg-[#0e0e0e] px-6 py-4">
        <h1 className="text-lg font-semibold text-[#e5e5e5]">Chat</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-20">
            <p className="text-[#555]">Start a conversation with Rue</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
              msg.role === "user"
                ? "bg-[#c8a050] text-[#0a0a0a]"
                : msg.role === "system"
                  ? "bg-[#1a1a1a] text-[#666] text-sm italic"
                  : "bg-[#1a1a1a] border border-[#222] text-[#e5e5e5]"
            }`}>
              {msg.role === "assistant" && (
                <p className="text-xs font-medium text-[#c8a050] mb-1">rue</p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content || (msg.isStreaming ? "..." : "")}</p>
              {msg.isStreaming && msg.content && (
                <span className="inline-block w-2 h-4 bg-[#c8a050] rounded-sm ml-0.5 animate-pulse" />
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[#1a1a1a] bg-[#0e0e0e] p-4">
        <div className="flex gap-3 max-w-3xl mx-auto">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-3 bg-[#141414] rounded-xl border border-[#1a1a1a] text-[#e5e5e5] placeholder-[#555] focus:outline-none focus:ring-2 focus:ring-[#c8a050]/30"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-5 py-3 bg-[#c8a050] hover:bg-[#d4ad5e] disabled:bg-[#333] text-[#0a0a0a] rounded-xl font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
