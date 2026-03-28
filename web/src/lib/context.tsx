import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { RueClient } from "./client";

const ClientContext = createContext<RueClient | null>(null);

export function useClient(): RueClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error("No RueClient");
  return client;
}

export function ClientProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<RueClient | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!clientRef.current) clientRef.current = new RueClient();
  const client = clientRef.current;

  useEffect(() => {
    let cancelled = false;
    client.connect().then(() => {
      if (cancelled) return;
      client.subscribe(["agent:*", "task:*", "message:*"]);
      setReady(true);
    }).catch(() => {
      if (cancelled) return;
      setError("Cannot connect to Rue daemon.");
    });
    return () => { cancelled = true; };
  }, [client]);

  if (error) return (
    <div className="h-screen flex items-center justify-center bg-bg relative overflow-hidden">
      <div className="orb orb-1" /><div className="orb orb-2" />
      <div className="text-center p-12 z-10 relative">
        <div className="w-3 h-3 rounded-full bg-error mx-auto mb-6" />
        <p className="text-lg text-text-primary mb-2 font-medium">Cannot connect to Rue</p>
        <p className="text-text-muted text-sm">Start the daemon: <code className="font-mono text-accent bg-glass px-2 py-0.5 rounded text-xs">rue daemon start</code></p>
      </div>
    </div>
  );

  if (!ready) return (
    <div className="h-screen flex items-center justify-center bg-bg relative overflow-hidden">
      <div className="orb orb-1" /><div className="orb orb-2" />
      <div className="text-center z-10 relative">
        <div className="w-2.5 h-2.5 rounded-full bg-accent animate-breathe mx-auto mb-4" />
        <p className="text-text-muted text-sm">Connecting...</p>
      </div>
    </div>
  );

  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
