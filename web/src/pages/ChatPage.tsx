import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useClient } from "../lib/context";

interface Msg { id: string; role: string; content: string; ts: number; streaming?: boolean; }

export function ChatPage() {
  const client = useClient();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client.history(30).then(r => {
      setMsgs(r.messages.filter(m => m.role !== "agent-event").map(m => ({ id: m.id, role: m.role, content: m.content, ts: m.timestamp })));
    }).catch(() => {});
  }, [client]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const text = input; setInput("");
    const uid = `u${Date.now()}`, aid = `a${Date.now()}`;
    setMsgs(p => [...p, { id: uid, role: "user", content: text, ts: Date.now() }, { id: aid, role: "assistant", content: "", ts: Date.now(), streaming: true }]);
    setBusy(true);
    try {
      const res = await client.ask(text, { onStream: (c) => setMsgs(p => p.map(m => m.id === aid ? { ...m, content: m.content + c } : m)) });
      setMsgs(p => p.map(m => m.id === aid ? { ...m, content: m.content || res.output, streaming: false } : m));
    } catch (err) {
      setMsgs(p => p.map(m => m.id === aid ? { ...m, content: `Error: ${err}`, streaming: false } : m));
    } finally { setBusy(false); }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {msgs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[60vh]">
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-accent" />
              </div>
              <h1 className="text-xl font-semibold text-text mb-1">How can I help?</h1>
              <p className="text-secondary text-sm">Ask me anything or start a project</p>
            </div>
          )}
          {msgs.map(m => (
            <div key={m.id} className="mb-6">
              {m.role === "user" ? (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-hover flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[11px] font-semibold text-secondary">Y</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-secondary mb-1">You</p>
                    <p className="text-[15px] text-text leading-relaxed">{m.content}</p>
                  </div>
                </div>
              ) : m.role === "assistant" ? (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-accent/70 mb-1">Rue</p>
                    <div className="text-[15px] text-text leading-relaxed whitespace-pre-wrap">
                      {m.content}
                      {m.streaming && <span className="inline-block w-0.5 h-[18px] bg-accent ml-0.5 animate-pulse" />}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted text-xs text-center italic">{m.content}</p>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-line">
        <form onSubmit={send} className="max-w-3xl mx-auto p-4 flex gap-3">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Message Rue..."
            className="flex-1 h-11 px-4 bg-surface border border-line rounded-xl text-text text-sm placeholder:text-muted focus:outline-none focus:border-accent/30 transition-colors" />
          <button type="submit" disabled={busy || !input.trim()}
            className="h-11 w-11 bg-accent hover:brightness-110 disabled:bg-hover disabled:text-muted text-bg rounded-xl flex items-center justify-center transition-all shrink-0">
            <Send size={16} />
          </button>
        </form>
        <p className="text-center text-[10px] text-muted pb-3">Rue may make mistakes. Verify important information.</p>
      </div>
    </div>
  );
}
