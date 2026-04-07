import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";

interface Message {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown> | null;
  session_id: string | null;
  created_at: number;
}

interface Fact {
  key: string;
  content: string;
  tags: string[];
  access_count: number;
  created_at: number;
  updated_at: number;
}

interface KBPage {
  path: string;
  title: string;
  content: string;
  tags: string[];
  access_count: number;
  created_at: string;
  updated_at: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  agent_id: string | null;
  due_at: number | null;
  schedule: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

export function useMessages(limit = 30, chatId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    let query = supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(limit);
    if (chatId) query = query.eq("metadata->>chatId", chatId);
    const { data } = await query;
    setMessages((data ?? []).reverse() as Message[]);
    setLoading(false);
  }, [limit, chatId]);

  useEffect(() => {
    refresh();
    // Real-time subscription
    const channel = supabase.channel("messages-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return { messages, loading, refresh };
}

export function useFacts(limit = 50) {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("facts").select("*").order("updated_at", { ascending: false }).limit(limit);
      setFacts((data ?? []) as Fact[]);
      setLoading(false);
    })();
  }, [limit]);

  return { facts, loading };
}

export function useKBPages() {
  const [pages, setPages] = useState<KBPage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("kb_pages").select("*").order("updated_at", { ascending: false });
      setPages((data ?? []) as KBPage[]);
      setLoading(false);
    })();
  }, []);

  return { pages, loading };
}

export function useIdentity() {
  const [identity, setIdentity] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("identity").select("data").eq("id", 1).single();
      setIdentity(data?.data as Record<string, unknown> ?? null);
      setLoading(false);
    })();
  }, []);

  return { identity, loading };
}

export function useUserProfile() {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("user_profile").select("data").eq("id", 1).single();
      setProfile(data?.data as Record<string, unknown> ?? null);
      setLoading(false);
    })();
  }, []);

  return { profile, loading };
}

export function useTasks(filter?: { status?: string; type?: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    let query = supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (filter?.status) query = query.eq("status", filter.status);
    if (filter?.type) query = query.eq("type", filter.type);
    const { data } = await query;
    setTasks((data ?? []) as Task[]);
    setLoading(false);
  }, [filter?.status, filter?.type]);

  useEffect(() => {
    refresh();
    const channel = supabase.channel("tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return { tasks, loading, refresh };
}

export function useConsolidationLogs(limit = 20) {
  const [logs, setLogs] = useState<Array<{ id: number; stage: string; result: string | null; created_at: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("consolidation_log").select("*").order("created_at", { ascending: false }).limit(limit);
      setLogs((data ?? []) as typeof logs);
      setLoading(false);
    })();
  }, [limit]);

  return { logs, loading };
}
