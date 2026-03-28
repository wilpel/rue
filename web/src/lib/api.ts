const API_BASE = "/api";

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

export interface ProjectDoc {
  name: string;
  path: string;
  content: string;
}

export const api = {
  projects: () => fetchJson<ProjectSummary[]>("/projects"),
  project: (name: string) => fetchJson<ProjectDetail>(`/projects/${encodeURIComponent(name)}`),
  projectTasks: (name: string) => fetchJson<Task[]>(`/projects/${encodeURIComponent(name)}/tasks`),
  projectDocs: (name: string) => fetchJson<ProjectDoc[]>(`/projects/${encodeURIComponent(name)}/docs`),
  history: (limit = 50) => fetchJson<{ messages: Array<{ id: string; role: string; content: string; timestamp: number }> }>(`/history?limit=${limit}`),
  daemonStatus: () => fetchJson<DaemonStatus>("/status"),
};
