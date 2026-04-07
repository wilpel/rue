const API_BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export interface DaemonStatus {
  status: string;
  agents: Array<{
    id: string;
    task: string;
    state: string;
    lane: string;
    cost: number;
  }>;
}

export const api = {
  daemonStatus: () => fetchJson<DaemonStatus>("/status"),
  delegates: () => fetchJson<{ agents: Array<Record<string, unknown>> }>("/delegates"),
  stopAllDelegates: () => fetch(`${API_BASE}/delegates/stop-all`, { method: "POST" }).then(r => r.json()),
};
