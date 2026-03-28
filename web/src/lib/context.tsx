import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { RueClient } from "./client";

const ClientContext = createContext<RueClient | null>(null);
export function useClient() { const c = useContext(ClientContext); if (!c) throw new Error("No client"); return c; }

export function ClientProvider({ children }: { children: ReactNode }) {
  const ref = useRef<RueClient | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ref.current) ref.current = new RueClient();
  const client = ref.current;

  useEffect(() => {
    let cancel = false;
    client.connect().then(() => { if (!cancel) { client.subscribe(["agent:*","task:*","message:*"]); setReady(true); }
    }).catch(() => { if (!cancel) setError("Cannot connect"); });
    return () => { cancel = true; };
  }, [client]);

  if (error) return (
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="text-center"><p className="text-text mb-2">Cannot connect to Rue</p>
      <p className="text-muted text-sm">Run <code className="font-mono text-accent">rue daemon start</code></p></div>
    </div>);
  if (!ready) return (<div className="h-screen flex items-center justify-center bg-bg"><p className="text-muted text-sm">Connecting...</p></div>);
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
