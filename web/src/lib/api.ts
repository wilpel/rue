const API_BASE = "http://127.0.0.1:18800/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export interface ProjectSummary {
  name: string;
  description: string;
  status: string;
  maxAgents: number;
  tags: string[];
  created: string;
  taskCounts: { todo: number; "in-progress": number; done: number };
}

export interface Task {
  filename: string;
  title: string;
  status: string;
  agent?: string;
  started?: string;
  completed?: string;
}

export interface ProjectDetail extends ProjectSummary {
  tasks: Task[];
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
  projects: () => fetchJson<ProjectSummary[]>("/projects"),
  project: (name: string) => fetchJson<ProjectDetail>(`/projects/${encodeURIComponent(name)}`),
  projectTasks: (name: string) => fetchJson<Task[]>(`/projects/${encodeURIComponent(name)}/tasks`),
  history: (limit = 50) => fetchJson<{ messages: unknown[] }>(`/history?limit=${limit}`),
  daemonStatus: () => fetchJson<DaemonStatus>("/status"),
};
