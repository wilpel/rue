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

  if (!clientRef.current) {
    clientRef.current = new RueClient();
  }
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
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="text-center p-12 animate-fade-in">
        <div className="w-3 h-3 rounded-full bg-error mx-auto mb-6" />
        <p className="text-lg text-text mb-2 font-medium">Cannot connect to Rue</p>
        <p className="text-text-muted text-sm">
          Start the daemon: <code className="font-mono text-gold bg-surface-2 px-2 py-0.5 rounded text-xs">rue daemon start</code>
        </p>
      </div>
    </div>
  );

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="text-center animate-fade-in">
        <div className="w-2 h-2 rounded-full bg-gold animate-pulse-gold mx-auto mb-4" />
        <p className="text-text-muted text-sm">Connecting to Rue...</p>
      </div>
    </div>
  );

  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
