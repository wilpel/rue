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
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="text-center">
        <p className="text-white text-base mb-2">Cannot connect to Rue</p>
        <p className="text-dim text-sm">Run <code className="font-code text-amber">rue daemon start</code></p>
      </div>
    </div>
  );

  if (!ready) return (
    <div className="h-screen flex items-center justify-center bg-bg">
      <p className="text-dim text-sm">Connecting...</p>
    </div>
  );

  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
