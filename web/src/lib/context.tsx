import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { RueClient } from "./client";

const ClientContext = createContext<RueClient | null>(null);

export function useClient(): RueClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error("No RueClient");
  return client;
}

export function ClientProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new RueClient());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.connect().then(() => {
      client.subscribe(["agent:*", "task:*", "message:*"]);
      setReady(true);
    }).catch(() => setError("Cannot connect to Rue daemon. Is it running?"));
    return () => client.disconnect();
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
