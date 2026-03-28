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

  // Create client once, persist across StrictMode re-mounts
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
      setError("Cannot connect to Rue daemon. Is it running?");
    });

    return () => {
      cancelled = true;
      // Don't disconnect on StrictMode re-mount — only on real unmount
    };
  }, [client]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50">
      <div className="text-center p-8">
        <p className="text-xl text-stone-700 mb-2">Cannot connect to Rue</p>
        <p className="text-stone-500">Start the daemon: <code className="bg-stone-100 px-2 py-1 rounded">rue daemon start</code></p>
      </div>
    </div>
  );

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50">
      <p className="text-stone-500 animate-pulse">Connecting to Rue...</p>
    </div>
  );

  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
