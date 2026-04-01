#!/usr/bin/env tsx

const API_BASE = process.env.RUE_API_URL ?? "http://localhost:18800";

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function parseDue(due: string): number | null {
  const s = due.trim().toLowerCase();
  const match = s.match(/^in\s+(\d+)\s*(m|min|h|hr|hour|d|day|s|sec)$/);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const ms = unit.startsWith("d") ? amount * 86_400_000
    : unit.startsWith("h") ? amount * 3_600_000
    : unit.startsWith("s") ? amount * 1_000
    : amount * 60_000;
  return Date.now() + ms;
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  return res.json();
}

switch (command) {
  case "create": {
    const title = getArg("title");
    if (!title) {
      console.error("Usage: run.ts create --title <title> [--type work|scheduled|reminder] [--priority low|normal|high|urgent] [--due 'in 30m']");
      process.exit(1);
    }
    const type = getArg("type");
    const priority = getArg("priority");
    const dueStr = getArg("due");
    const dueAt = dueStr ? parseDue(dueStr) : undefined;
    const schedule = getArg("schedule");

    if (dueStr && !dueAt) {
      console.error(`Invalid --due format: "${dueStr}". Use "in 30m", "in 2h", "in 1d", etc.`);
      process.exit(1);
    }

    const result = await api("POST", "/api/tasks", {
      title,
      type: type ?? "work",
      priority: priority ?? "normal",
      dueAt: dueAt ?? undefined,
      schedule: schedule ?? undefined,
    }) as Record<string, unknown>;

    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    console.log(`Created task: ${result.title}`);
    console.log(`  ID: ${result.id}`);
    console.log(`  Type: ${result.type}`);
    console.log(`  Priority: ${result.priority}`);
    if (result.due_at) console.log(`  Due: ${new Date(result.due_at as number).toLocaleString()}`);
    if (result.schedule) console.log(`  Schedule: ${result.schedule}`);
    break;
  }

  case "list": {
    const status = getArg("status");
    const type = getArg("type");
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    const qs = params.toString() ? `?${params.toString()}` : "";

    const result = await api("GET", `/api/tasks${qs}`) as { tasks: Array<Record<string, unknown>> };
    const tasks = result.tasks ?? [];

    if (tasks.length === 0) {
      console.log("No tasks found.");
    } else {
      console.log(`${tasks.length} task(s):\n`);
      for (const t of tasks) {
        const statusStr = t.status as string;
        const due = t.due_at ? new Date(t.due_at as number).toLocaleString() : "";
        console.log(`  ${t.title} [${statusStr}] (${t.priority})`);
        console.log(`    ID: ${t.id} | Type: ${t.type}`);
        if (due) console.log(`    Due: ${due}`);
        if (t.schedule) console.log(`    Schedule: ${t.schedule}`);
        console.log();
      }
    }
    break;
  }

  case "update": {
    const id = getArg("id");
    if (!id) {
      console.error("Usage: run.ts update --id <id> [--status pending|active|completed|failed|cancelled] [--priority ...] [--title ...]");
      process.exit(1);
    }
    const body: Record<string, unknown> = {};
    const statusVal = getArg("status");
    const titleVal = getArg("title");
    const priorityVal = getArg("priority");
    if (statusVal) body.status = statusVal;
    if (titleVal) body.title = titleVal;
    if (priorityVal) body.priority = priorityVal;

    const result = await api("POST", `/api/tasks/${id}`, body) as Record<string, unknown>;
    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    console.log(`Updated task: ${result.title} [${result.status}]`);
    break;
  }

  case "complete": {
    const id = getArg("id");
    if (!id) {
      console.error("Usage: run.ts complete --id <id>");
      process.exit(1);
    }
    const result = await api("POST", `/api/tasks/${id}`, { status: "completed" }) as Record<string, unknown>;
    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    console.log(`Completed task: ${result.title}`);
    break;
  }

  case "delete": {
    const id = getArg("id");
    if (!id) {
      console.error("Usage: run.ts delete --id <id>");
      process.exit(1);
    }
    const result = await api("DELETE", `/api/tasks/${id}`) as Record<string, unknown>;
    console.log(result.ok ? `Deleted task: ${id}` : `Task not found: ${id}`);
    break;
  }

  default:
    console.log("Usage: run.ts <create|list|update|complete|delete> [options]");
    console.log("Run each command without args for detailed usage.");
}
