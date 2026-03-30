import { useEffect, useState } from "react";
import { KeyRound, Plus, Trash2, Eye, EyeOff } from "lucide-react";

export function SecretsPage() {
  const [keys, setKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showValue, setShowValue] = useState(false);

  const loadKeys = () => {
    fetch("/api/secrets").then(r => r.json()).then(d => setKeys(d.keys || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadKeys(); }, []);

  const addSecret = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    await fetch("/api/secrets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: newKey, value: newValue }) });
    setNewKey(""); setNewValue(""); setShowAdd(false); setShowValue(false);
    loadKeys();
  };

  const deleteSecret = async (key: string) => {
    await fetch(`/api/secrets/${encodeURIComponent(key)}`, { method: "DELETE" });
    loadKeys();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="h-12 flex items-center justify-between px-5 border-b border-line shrink-0">
        <h1 className="text-sm font-semibold text-text">Secrets</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-bg text-xs font-semibold rounded-lg hover:brightness-110 transition-all">
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-lg">
          {showAdd && (
            <div className="p-4 rounded-lg border border-line bg-surface mb-4 space-y-3">
              <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Key name (e.g. OPENAI_API_KEY)"
                className="w-full h-9 px-3 bg-bg border border-line rounded-lg text-text text-sm placeholder:text-muted focus:outline-none focus:border-accent/30" />
              <div className="relative">
                <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="Secret value"
                  type={showValue ? "text" : "password"}
                  className="w-full h-9 px-3 pr-10 bg-bg border border-line rounded-lg text-text text-sm placeholder:text-muted focus:outline-none focus:border-accent/30" />
                <button onClick={() => setShowValue(!showValue)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-secondary">
                  {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={addSecret} className="h-8 px-4 bg-accent text-bg text-xs font-semibold rounded-lg hover:brightness-110">Save</button>
                <button onClick={() => { setShowAdd(false); setNewKey(""); setNewValue(""); }} className="h-8 px-3 text-muted text-xs hover:text-secondary">Cancel</button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-muted text-sm text-center mt-8">Loading...</p>
          ) : keys.length === 0 ? (
            <div className="text-center mt-16">
              <KeyRound size={28} className="mx-auto text-muted/30 mb-2" strokeWidth={1} />
              <p className="text-muted text-sm mb-1">No secrets stored</p>
              <p className="text-muted/60 text-xs">Add API keys, tokens, and credentials</p>
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map(key => (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-line bg-surface group">
                  <div className="flex items-center gap-3">
                    <KeyRound size={14} className="text-accent shrink-0" />
                    <span className="text-sm text-text font-mono">{key}</span>
                  </div>
                  <button onClick={() => deleteSecret(key)} className="p-1.5 text-muted hover:text-red opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 p-3 rounded-lg border border-line bg-surface/50">
            <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2">Security</p>
            <p className="text-xs text-muted leading-relaxed">
              Secrets are encrypted with AES-256-GCM at rest. Values are never displayed in the UI.
              Use <code className="text-accent font-mono">rue secrets get &lt;key&gt;</code> in the terminal to retrieve values.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
