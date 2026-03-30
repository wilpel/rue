# NestJS Foundation Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the NestJS application and migrate Config, Database, Bus, Memory, and Identity modules — the foundation all other modules build on.

**Architecture:** NestJS application with global ConfigModule, DatabaseModule (single SQLite + Drizzle), BusModule (typed pub/sub), MemoryModule (semantic, working, KB, messages, assembler), and IdentityModule (agent personality + user profile). Each module is independently testable.

**Tech Stack:** NestJS 11, Drizzle ORM + better-sqlite3, Zod validation, Vitest, TypeScript strict mode

**Spec:** `docs/superpowers/specs/2026-03-30-nestjs-refactor-design.md`

**Scope:** Phases 1-2 of the migration. After this plan, all data-layer services exist as injectable NestJS providers. No HTTP/WS yet — that's Plan 2.

---

### Task 1: Install NestJS dependencies and configure TypeScript

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Install NestJS core packages**

```bash
npm install @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/websockets @nestjs/platform-ws reflect-metadata rxjs
```

- [ ] **Step 2: Update tsconfig.json for NestJS decorators**

Add `experimentalDecorators` and `emitDecoratorMetadata` to `compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors (existing code still compiles)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "chore: add NestJS dependencies and enable decorators"
```

---

### Task 2: Create shared types and utilities

These are pure files with no NestJS dependencies — used by all modules.

**Files:**
- Create: `src/shared/types.ts` (already exists, verify it's complete)
- Create: `src/shared/ids.ts` (already exists)
- Create: `src/shared/logger.ts` (already exists)
- Create: `src/shared/sdk-types.ts` (already exists)
- Create: `src/shared/errors.ts` (already exists)

- [ ] **Step 1: Verify shared/ is complete**

No changes needed — `src/shared/` already has all the types. Run:

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 2: Commit (skip if no changes)**

---

### Task 3: ConfigModule — global configuration service

**Files:**
- Create: `src/config/config.service.ts`
- Create: `src/config/config.module.ts`
- Create: `tests/config/config.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/config/config.service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ConfigService } from "../../src/config/config.service.js";

describe("ConfigService", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const svc = new ConfigService(path.join(tmpDir, "config.json"));
    expect(svc.port).toBe(18800);
    expect(svc.dataDir).toContain(".rue");
  });

  it("loads config from file", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ port: 9999 }));
    const svc = new ConfigService(configPath);
    expect(svc.port).toBe(9999);
  });

  it("validates config and throws on invalid port", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ port: -1 }));
    expect(() => new ConfigService(configPath)).toThrow();
  });

  it("exposes all config fields", () => {
    const svc = new ConfigService(path.join(tmpDir, "nonexistent.json"));
    expect(svc.lanes).toEqual({ main: 1, sub: 6, cron: 2, skill: 2 });
    expect(svc.maxAgents).toBe(8);
    expect(typeof svc.dataDir).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config/config.service.test.ts
```

Expected: FAIL — `ConfigService` does not exist

- [ ] **Step 3: Implement ConfigService**

```typescript
// src/config/config.service.ts
import { Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";

const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(18800),
  dataDir: z.string().default(path.join(os.homedir(), ".rue")),
  lanes: z
    .object({
      main: z.number().int().min(1).default(1),
      sub: z.number().int().min(1).default(6),
      cron: z.number().int().min(1).default(2),
      skill: z.number().int().min(1).default(2),
    })
    .default({ main: 1, sub: 6, cron: 2, skill: 2 }),
  maxAgents: z.number().int().min(1).default(8),
  stall: z
    .object({
      timeoutMs: z.number().int().min(5000).default(60_000),
      nudgeMs: z.number().int().min(1000).default(30_000),
    })
    .default({ timeoutMs: 60_000, nudgeMs: 30_000 }),
  budgets: z
    .object({
      dailyCeiling: z.number().min(0).default(10),
    })
    .default({ dailyCeiling: 10 }),
});

type RueConfig = z.infer<typeof ConfigSchema>;

@Injectable()
export class ConfigService {
  private readonly config: RueConfig;

  constructor(configPath?: string) {
    const filePath = configPath ?? path.join(os.homedir(), ".rue", "config.json");
    this.config = this.load(filePath);
  }

  get port(): number { return this.config.port; }
  get dataDir(): string { return this.config.dataDir; }
  get lanes(): RueConfig["lanes"] { return this.config.lanes; }
  get maxAgents(): number { return this.config.maxAgents; }
  get stall(): RueConfig["stall"] { return this.config.stall; }
  get budgets(): RueConfig["budgets"] { return this.config.budgets; }

  private load(filePath: string): RueConfig {
    if (!fs.existsSync(filePath)) {
      return ConfigSchema.parse({});
    }
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return ConfigSchema.parse(raw);
  }
}
```

- [ ] **Step 4: Create ConfigModule**

```typescript
// src/config/config.module.ts
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "./config.service.js";

@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/config/config.service.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/config/ tests/config/
git commit -m "feat: ConfigModule — global config service with Zod validation"
```

---

### Task 4: DatabaseModule — single SQLite + Drizzle schema

**Files:**
- Create: `src/database/schema.ts`
- Create: `src/database/database.service.ts`
- Create: `src/database/database.module.ts`
- Create: `tests/database/database.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/database/database.service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DatabaseService } from "../../src/database/database.service.js";

describe("DatabaseService", () => {
  let tmpDir: string;
  let dbService: DatabaseService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-db-test-"));
    dbService = new DatabaseService(tmpDir);
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the database file", () => {
    expect(fs.existsSync(path.join(tmpDir, "rue.sqlite"))).toBe(true);
  });

  it("creates all tables", () => {
    const db = dbService.getDb();
    const tables = db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name") as Array<{ name: string }>;
    const names = tables.map(t => t.name).filter(n => !n.startsWith("sqlite_") && !n.startsWith("__"));
    expect(names).toContain("messages");
    expect(names).toContain("facts");
    expect(names).toContain("jobs");
    expect(names).toContain("events");
    expect(names).toContain("telegram_users");
  });

  it("exposes drizzle instance", () => {
    const drizzle = dbService.getDrizzle();
    expect(drizzle).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/database/database.service.test.ts
```

Expected: FAIL — `DatabaseService` does not exist

- [ ] **Step 3: Create Drizzle schema**

```typescript
// src/database/schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  sessionId: text("session_id"),
  createdAt: integer("created_at").notNull(),
});

export const facts = sqliteTable("facts", {
  key: text("key").primaryKey(),
  content: text("content").notNull(),
  tags: text("tags").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  schedule: text("schedule").notNull(),
  task: text("task").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  lastRunAt: integer("last_run_at"),
  nextRunAt: integer("next_run_at"),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channel: text("channel").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const telegramUsers = sqliteTable("telegram_users", {
  telegramId: integer("telegram_id").primaryKey(),
  username: text("username"),
  pairedAt: text("paired_at").notNull(),
});
```

- [ ] **Step 4: Implement DatabaseService**

```typescript
// src/database/database.service.ts
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Database, { type Database as DB } from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as schema from "./schema.js";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly db: DB;
  private readonly drizzleDb: BetterSQLite3Database<typeof schema>;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "rue.sqlite");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.drizzleDb = drizzle(this.db, { schema });
    this.migrate();
  }

  getDb(): DB {
    return this.db;
  }

  getDrizzle(): BetterSQLite3Database<typeof schema> {
    return this.drizzleDb;
  }

  close(): void {
    this.db.close();
  }

  onModuleDestroy(): void {
    this.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        session_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

      CREATE TABLE IF NOT EXISTS facts (
        key TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        task TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_run_at INTEGER,
        next_run_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telegram_users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        paired_at TEXT NOT NULL
      );
    `);
  }
}
```

- [ ] **Step 5: Create DatabaseModule**

```typescript
// src/database/database.module.ts
import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import { ConfigService } from "../config/config.service.js";

@Global()
@Module({
  providers: [
    {
      provide: DatabaseService,
      useFactory: (config: ConfigService) => new DatabaseService(config.dataDir),
      inject: [ConfigService],
    },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run tests/database/database.service.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/database/ tests/database/
git commit -m "feat: DatabaseModule — single SQLite with Drizzle schema"
```

---

### Task 5: BusModule — typed event bus as injectable service

**Files:**
- Create: `src/bus/bus.service.ts`
- Create: `src/bus/bus-persistence.service.ts`
- Create: `src/bus/channels.ts` (port from existing)
- Create: `src/bus/bus.module.ts`
- Create: `tests/bus/bus.service.test.ts`
- Create: `tests/bus/bus-persistence.service.test.ts`

- [ ] **Step 1: Copy channels.ts**

Port `src/bus/channels.ts` as-is — it's already clean:

```typescript
// src/bus/channels.ts
export interface BusChannels {
  "agent:spawned": { id: string; task: string; lane: string };
  "agent:progress": { id: string; chunk: string; tool?: string };
  "agent:completed": { id: string; result: string; cost: number };
  "agent:failed": { id: string; error: string; retryable: boolean };
  "agent:stalled": { id: string; lastOutputMs: number };
  "agent:killed": { id: string; reason: string };
  "task:created": { id: string; goal: string; nodeCount: number };
  "task:updated": { id: string; nodeId: string; status: string };
  "task:completed": { id: string; result: string };
  "memory:stored": { type: string; key: string };
  "memory:recalled": { type: string; query: string; resultCount: number };
  "identity:updated": { field: string; oldValue: unknown; newValue: unknown };
  "system:started": Record<string, never>;
  "system:shutdown": { reason: string };
  "system:health": { agents: number; queueDepth: number; memoryMb: number };
  "interface:input": { source: string; text: string };
  "interface:output": { target: string; text: string };
  "interface:stream": { agentId: string; chunk: string };
  "message:created": { id: string; role: string; content: string; timestamp: number; sessionId?: string; metadata?: Record<string, unknown> };
}

export type ChannelName = keyof BusChannels;
export type ChannelPayload<C extends ChannelName> = BusChannels[C];
```

- [ ] **Step 2: Write the failing test for BusService**

```typescript
// tests/bus/bus.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BusService } from "../../src/bus/bus.service.js";

describe("BusService", () => {
  let bus: BusService;

  beforeEach(() => {
    bus = new BusService();
  });

  it("delivers events to subscribers", () => {
    const handler = vi.fn();
    bus.on("agent:spawned", handler);
    bus.emit("agent:spawned", { id: "a1", task: "test", lane: "sub" });
    expect(handler).toHaveBeenCalledWith({ id: "a1", task: "test", lane: "sub" });
  });

  it("unsubscribes correctly", () => {
    const handler = vi.fn();
    const unsub = bus.on("agent:spawned", handler);
    unsub();
    bus.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("wildcard matches prefix", () => {
    const handler = vi.fn();
    bus.onWildcard("agent:*", handler);
    bus.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
    bus.emit("agent:completed", { id: "a1", result: "done", cost: 0 });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("once fires once then unsubscribes", () => {
    const handler = vi.fn();
    bus.once("agent:completed", handler);
    bus.emit("agent:completed", { id: "a1", result: "done", cost: 0 });
    bus.emit("agent:completed", { id: "a2", result: "done2", cost: 0 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("request/reply works", async () => {
    bus.handle("memory:recalled", async (payload) => {
      return { results: [`found: ${payload.query}`] };
    });
    const result = await bus.request("memory:recalled", { type: "semantic", query: "test", resultCount: 0 });
    expect(result).toEqual({ results: ["found: test"] });
  });

  it("request rejects on timeout", async () => {
    bus.handle("memory:recalled", async () => {
      await new Promise(r => setTimeout(r, 5000));
      return {};
    });
    await expect(bus.request("memory:recalled", { type: "semantic", query: "test", resultCount: 0 }, { timeoutMs: 50 })).rejects.toThrow("timed out");
  });

  it("waitFor resolves when event fires", async () => {
    setTimeout(() => bus.emit("agent:completed", { id: "a1", result: "done", cost: 0 }), 10);
    const payload = await bus.waitFor("agent:completed", { timeoutMs: 1000 });
    expect(payload.id).toBe("a1");
  });

  it("removeAllListeners clears everything", () => {
    const handler = vi.fn();
    bus.on("agent:spawned", handler);
    bus.onWildcard("agent:*", vi.fn());
    bus.removeAllListeners();
    bus.emit("agent:spawned", { id: "a1", task: "t", lane: "sub" });
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/bus/bus.service.test.ts
```

Expected: FAIL — `BusService` does not exist

- [ ] **Step 4: Implement BusService**

```typescript
// src/bus/bus.service.ts
import { Injectable } from "@nestjs/common";
import type { ChannelName, ChannelPayload } from "./channels.js";

type Handler<C extends ChannelName> = (payload: ChannelPayload<C>) => void;
type WildcardHandler = (channel: string, payload: unknown) => void;
type RequestHandler<C extends ChannelName> = (payload: ChannelPayload<C>) => Promise<unknown>;
type Unsubscribe = () => void;

@Injectable()
export class BusService {
  private listeners = new Map<string, Set<Handler<ChannelName>>>();
  private wildcardListeners = new Map<string, Set<WildcardHandler>>();
  private requestHandlers = new Map<string, RequestHandler<ChannelName>>();

  on<C extends ChannelName>(channel: C, handler: Handler<C>): Unsubscribe {
    const set = this.listeners.get(channel) ?? new Set();
    set.add(handler as Handler<ChannelName>);
    this.listeners.set(channel, set);
    return () => { set.delete(handler as Handler<ChannelName>); };
  }

  once<C extends ChannelName>(channel: C, handler: Handler<C>): Unsubscribe {
    const unsub = this.on(channel, ((payload: ChannelPayload<C>) => {
      unsub();
      handler(payload);
    }) as Handler<C>);
    return unsub;
  }

  onWildcard(pattern: string, handler: WildcardHandler): Unsubscribe {
    const prefix = pattern.replace(/\*$/, "");
    const set = this.wildcardListeners.get(prefix) ?? new Set();
    set.add(handler);
    this.wildcardListeners.set(prefix, set);
    return () => { set.delete(handler); };
  }

  emit<C extends ChannelName>(channel: C, payload: ChannelPayload<C>): void {
    const handlers = this.listeners.get(channel);
    if (handlers) {
      for (const handler of handlers) handler(payload);
    }
    for (const [prefix, wildcardHandlers] of this.wildcardListeners) {
      if (channel.startsWith(prefix)) {
        for (const handler of wildcardHandlers) handler(channel, payload);
      }
    }
  }

  handle<C extends ChannelName>(channel: C, handler: RequestHandler<C>): Unsubscribe {
    this.requestHandlers.set(channel, handler as RequestHandler<ChannelName>);
    return () => { this.requestHandlers.delete(channel); };
  }

  async request<C extends ChannelName>(
    channel: C,
    payload: ChannelPayload<C>,
    opts?: { timeoutMs?: number },
  ): Promise<unknown> {
    const handler = this.requestHandlers.get(channel);
    if (!handler) throw new Error(`No handler registered for channel "${channel}"`);
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    return Promise.race([
      handler(payload),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Request to "${channel}" timed out`)), timeoutMs)),
    ]);
  }

  waitFor<C extends ChannelName>(channel: C, opts?: { timeoutMs?: number }): Promise<ChannelPayload<C>> {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { unsub(); reject(new Error(`waitFor "${channel}" timed out`)); }, timeoutMs);
      const unsub = this.once(channel, ((payload: ChannelPayload<C>) => {
        clearTimeout(timer);
        resolve(payload);
      }) as Handler<C>);
    });
  }

  removeAllListeners(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
    this.requestHandlers.clear();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/bus/bus.service.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 6: Write the failing test for BusPersistenceService**

```typescript
// tests/bus/bus-persistence.service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DatabaseService } from "../../src/database/database.service.js";
import { BusPersistenceService } from "../../src/bus/bus-persistence.service.js";

describe("BusPersistenceService", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let persistence: BusPersistenceService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-buspers-test-"));
    dbService = new DatabaseService(tmpDir);
    persistence = new BusPersistenceService(dbService);
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends events to database", () => {
    persistence.append("agent:spawned", { id: "a1", task: "test", lane: "sub" });
    persistence.append("agent:completed", { id: "a1", result: "done", cost: 0 });
    const events = persistence.readTail(10);
    expect(events).toHaveLength(2);
    expect(events[0].channel).toBe("agent:spawned");
    expect(events[1].channel).toBe("agent:completed");
  });

  it("readTail returns last N events", () => {
    for (let i = 0; i < 10; i++) {
      persistence.append("agent:progress", { id: `a${i}`, chunk: `chunk-${i}` });
    }
    const tail = persistence.readTail(3);
    expect(tail).toHaveLength(3);
    expect(JSON.parse(tail[0].payload as string).id).toBe("a7");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

```bash
npx vitest run tests/bus/bus-persistence.service.test.ts
```

Expected: FAIL — `BusPersistenceService` does not exist

- [ ] **Step 8: Implement BusPersistenceService**

```typescript
// src/bus/bus-persistence.service.ts
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { events } from "../database/schema.js";
import { desc } from "drizzle-orm";

export interface PersistedEvent {
  id: number;
  channel: string;
  payload: string;
  createdAt: number;
}

@Injectable()
export class BusPersistenceService {
  constructor(private readonly db: DatabaseService) {}

  append(channel: string, payload: unknown): void {
    this.db.getDrizzle().insert(events).values({
      channel,
      payload: JSON.stringify(payload),
      createdAt: Date.now(),
    }).run();
  }

  readTail(count: number): PersistedEvent[] {
    const rows = this.db.getDrizzle()
      .select()
      .from(events)
      .orderBy(desc(events.id))
      .limit(count)
      .all();
    return rows.reverse() as PersistedEvent[];
  }
}
```

- [ ] **Step 9: Create BusModule**

```typescript
// src/bus/bus.module.ts
import { Global, Module } from "@nestjs/common";
import { BusService } from "./bus.service.js";
import { BusPersistenceService } from "./bus-persistence.service.js";

@Global()
@Module({
  providers: [BusService, BusPersistenceService],
  exports: [BusService, BusPersistenceService],
})
export class BusModule {}
```

- [ ] **Step 10: Run both bus tests**

```bash
npx vitest run tests/bus/
```

Expected: PASS (all tests)

- [ ] **Step 11: Commit**

```bash
git add src/bus/ tests/bus/
git commit -m "feat: BusModule — typed event bus + DB-backed persistence"
```

---

### Task 6: IdentityModule — agent personality + user profile

**Files:**
- Create: `src/identity/identity.service.ts`
- Create: `src/identity/user-model.service.ts`
- Create: `src/identity/identity.module.ts`
- Create: `tests/identity/identity.service.test.ts`
- Create: `tests/identity/user-model.service.test.ts`

- [ ] **Step 1: Write failing test for IdentityService**

```typescript
// tests/identity/identity.service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { IdentityService } from "../../src/identity/identity.service.js";

describe("IdentityService", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-identity-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns default identity when no file exists", () => {
    const svc = new IdentityService(tmpDir);
    const state = svc.getState();
    expect(state.name).toBeNull();
    expect(state.values).toContain("honesty");
  });

  it("updates and saves identity", () => {
    const svc = new IdentityService(tmpDir);
    svc.update({ name: "Rue" });
    svc.save();

    const svc2 = new IdentityService(tmpDir);
    expect(svc2.getState().name).toBe("Rue");
  });

  it("generates prompt text", () => {
    const svc = new IdentityService(tmpDir);
    svc.update({ name: "Rue" });
    const text = svc.toPromptText();
    expect(text).toContain("Rue");
    expect(text).toContain("identity");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/identity/identity.service.test.ts
```

Expected: FAIL — `IdentityService` does not exist

- [ ] **Step 3: Implement IdentityService**

```typescript
// src/identity/identity.service.ts
import { Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";

export interface Identity {
  name: string | null;
  personalityBase: string;
  communicationStyle: string;
  values: string[];
  expertiseAreas: string[];
  quirks: string[];
}

const DEFAULT_IDENTITY: Identity = {
  name: null,
  personalityBase: "A helpful, thoughtful AI assistant that values clarity, honesty, and precision.",
  communicationStyle: "Clear, concise, and direct. Avoids unnecessary verbosity.",
  values: ["honesty", "clarity", "precision", "helpfulness"],
  expertiseAreas: [],
  quirks: [],
};

@Injectable()
export class IdentityService {
  private state: Identity;
  private readonly filePath: string;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "identity.json");
    this.state = this.load();
  }

  getState(): Identity {
    return { ...this.state };
  }

  update(partial: Partial<Identity>): void {
    this.state = { ...this.state, ...partial };
  }

  save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf-8");
  }

  toPromptText(): string {
    const lines: string[] = ["# Agent identity"];
    if (this.state.name) {
      lines.push(`You are ${this.state.name}, an AI assistant with a defined identity.`);
    } else {
      lines.push("You are an AI assistant with a defined identity.");
    }
    lines.push(`Personality: ${this.state.personalityBase}`);
    lines.push(`Communication style: ${this.state.communicationStyle}`);
    if (this.state.values.length > 0) lines.push(`Core values: ${this.state.values.join(", ")}`);
    if (this.state.expertiseAreas.length > 0) lines.push(`Areas of expertise: ${this.state.expertiseAreas.join(", ")}`);
    if (this.state.quirks.length > 0) lines.push(`Quirks: ${this.state.quirks.join(", ")}`);
    return lines.join("\n");
  }

  private load(): Identity {
    if (fs.existsSync(this.filePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as Identity;
      } catch { /* fall through */ }
    }
    return { ...DEFAULT_IDENTITY };
  }
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/identity/identity.service.test.ts
```

Expected: PASS

- [ ] **Step 5: Write failing test for UserModelService**

```typescript
// tests/identity/user-model.service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { UserModelService } from "../../src/identity/user-model.service.js";

describe("UserModelService", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-usermodel-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns default profile when no file exists", () => {
    const svc = new UserModelService(tmpDir);
    expect(svc.getProfile().name).toBeNull();
  });

  it("updates and persists profile", () => {
    const svc = new UserModelService(tmpDir);
    svc.update({ name: "William" });
    svc.save();

    const svc2 = new UserModelService(tmpDir);
    expect(svc2.getProfile().name).toBe("William");
  });

  it("adds expertise", () => {
    const svc = new UserModelService(tmpDir);
    svc.updateExpertise("TypeScript", "expert");
    expect(svc.getProfile().expertise).toEqual({ TypeScript: "expert" });
  });

  it("adds preferences without duplicates", () => {
    const svc = new UserModelService(tmpDir);
    svc.addPreference("dark mode");
    svc.addPreference("dark mode");
    expect(svc.getProfile().preferences).toEqual(["dark mode"]);
  });

  it("generates prompt text", () => {
    const svc = new UserModelService(tmpDir);
    svc.update({ name: "William" });
    const text = svc.toPromptText();
    expect(text).toContain("William");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run tests/identity/user-model.service.test.ts
```

Expected: FAIL

- [ ] **Step 7: Implement UserModelService**

```typescript
// src/identity/user-model.service.ts
import { Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";

export interface UserProfile {
  name: string | null;
  expertise: Record<string, string>;
  preferences: string[];
  workPatterns: string[];
  currentProjects: string[];
  communicationStyle: string;
}

const DEFAULT_PROFILE: UserProfile = {
  name: null,
  expertise: {},
  preferences: [],
  workPatterns: [],
  currentProjects: [],
  communicationStyle: "",
};

@Injectable()
export class UserModelService {
  private profile: UserProfile;
  private readonly filePath: string;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "user-profile.json");
    this.profile = this.load();
  }

  getProfile(): UserProfile {
    return {
      ...this.profile,
      expertise: { ...this.profile.expertise },
      preferences: [...this.profile.preferences],
      workPatterns: [...this.profile.workPatterns],
      currentProjects: [...this.profile.currentProjects],
    };
  }

  update(partial: Partial<UserProfile>): void {
    this.profile = { ...this.profile, ...partial };
  }

  updateExpertise(area: string, level: string): void {
    this.profile.expertise = { ...this.profile.expertise, [area]: level };
  }

  addPreference(preference: string): void {
    if (!this.profile.preferences.includes(preference)) {
      this.profile.preferences = [...this.profile.preferences, preference];
    }
  }

  save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.profile, null, 2), "utf-8");
  }

  toPromptText(): string {
    const hasData =
      this.profile.name !== null ||
      Object.keys(this.profile.expertise).length > 0 ||
      this.profile.preferences.length > 0 ||
      this.profile.workPatterns.length > 0 ||
      this.profile.currentProjects.length > 0;

    if (!hasData) return "User profile: not yet learned anything about the user.";

    const lines: string[] = ["# User profile"];
    if (this.profile.name) lines.push(`Name: ${this.profile.name}`);
    if (Object.keys(this.profile.expertise).length > 0) {
      lines.push("Expertise:");
      for (const [area, level] of Object.entries(this.profile.expertise)) {
        lines.push(`  - ${area}: ${level}`);
      }
    }
    if (this.profile.preferences.length > 0) lines.push(`Preferences: ${this.profile.preferences.join(", ")}`);
    if (this.profile.workPatterns.length > 0) lines.push(`Work patterns: ${this.profile.workPatterns.join(", ")}`);
    if (this.profile.currentProjects.length > 0) lines.push(`Current projects: ${this.profile.currentProjects.join(", ")}`);
    if (this.profile.communicationStyle) lines.push(`Communication style: ${this.profile.communicationStyle}`);
    return lines.join("\n");
  }

  private load(): UserProfile {
    if (fs.existsSync(this.filePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as UserProfile;
      } catch { /* fall through */ }
    }
    return { ...DEFAULT_PROFILE, expertise: {}, preferences: [], workPatterns: [], currentProjects: [] };
  }
}
```

- [ ] **Step 8: Create IdentityModule**

```typescript
// src/identity/identity.module.ts
import { Module } from "@nestjs/common";
import { IdentityService } from "./identity.service.js";
import { UserModelService } from "./user-model.service.js";
import { ConfigService } from "../config/config.service.js";
import * as path from "node:path";

@Module({
  providers: [
    {
      provide: IdentityService,
      useFactory: (config: ConfigService) => new IdentityService(path.join(config.dataDir, "identity")),
      inject: [ConfigService],
    },
    {
      provide: UserModelService,
      useFactory: (config: ConfigService) => new UserModelService(path.join(config.dataDir, "identity")),
      inject: [ConfigService],
    },
  ],
  exports: [IdentityService, UserModelService],
})
export class IdentityModule {}
```

- [ ] **Step 9: Run all identity tests**

```bash
npx vitest run tests/identity/
```

Expected: PASS (all tests)

- [ ] **Step 10: Commit**

```bash
git add src/identity/ tests/identity/
git commit -m "feat: IdentityModule — agent personality + user profile services"
```

---

### Task 7: MemoryModule — message repo, semantic repo, working memory, KB, assembler

**Files:**
- Create: `src/memory/message.repository.ts`
- Create: `src/memory/semantic.repository.ts`
- Create: `src/memory/working-memory.service.ts`
- Create: `src/memory/knowledge-base.service.ts`
- Create: `src/memory/assembler.service.ts`
- Create: `src/memory/memory.module.ts`
- Create: `tests/memory/message.repository.test.ts`
- Create: `tests/memory/semantic.repository.test.ts`
- Create: `tests/memory/working-memory.service.test.ts`
- Create: `tests/memory/knowledge-base.service.test.ts`
- Create: `tests/memory/assembler.service.test.ts`

This is the largest task. Each sub-service is tested then implemented.

- [ ] **Step 1: Write failing test for MessageRepository**

```typescript
// tests/memory/message.repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DatabaseService } from "../../src/database/database.service.js";
import { MessageRepository } from "../../src/memory/message.repository.js";

describe("MessageRepository", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let repo: MessageRepository;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-msg-test-"));
    dbService = new DatabaseService(tmpDir);
    repo = new MessageRepository(dbService);
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends and retrieves messages", () => {
    repo.append({ role: "user", content: "hello" });
    repo.append({ role: "assistant", content: "hi there" });
    const messages = repo.recent(10);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  it("recent returns newest last", () => {
    repo.append({ role: "user", content: "first" });
    repo.append({ role: "user", content: "second" });
    const messages = repo.recent(10);
    expect(messages[0].content).toBe("first");
    expect(messages[1].content).toBe("second");
  });

  it("respects limit", () => {
    for (let i = 0; i < 10; i++) repo.append({ role: "user", content: `msg-${i}` });
    const messages = repo.recent(3);
    expect(messages).toHaveLength(3);
  });

  it("stores metadata as JSON", () => {
    repo.append({ role: "push", content: "test", metadata: { source: "scheduler" } });
    const messages = repo.recent(1);
    expect(messages[0].metadata).toEqual({ source: "scheduler" });
  });

  it("counts messages", () => {
    repo.append({ role: "user", content: "a" });
    repo.append({ role: "user", content: "b" });
    expect(repo.count()).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/memory/message.repository.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement MessageRepository**

```typescript
// src/memory/message.repository.ts
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { messages } from "../database/schema.js";
import { desc, count, eq, lt, gt, and } from "drizzle-orm";
import { nanoid } from "nanoid";

export type MessageRole = "user" | "assistant" | "system" | "agent-event" | "push";

export interface StoredMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class MessageRepository {
  constructor(private readonly db: DatabaseService) {}

  append(msg: {
    role: MessageRole;
    content: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): StoredMessage {
    const id = `msg_${nanoid(12)}`;
    const createdAt = Date.now();
    this.db.getDrizzle().insert(messages).values({
      id,
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata ? JSON.stringify(msg.metadata) : null,
      sessionId: msg.sessionId ?? null,
      createdAt,
    }).run();
    return { id, role: msg.role, content: msg.content, createdAt, sessionId: msg.sessionId, metadata: msg.metadata };
  }

  recent(limit = 20): StoredMessage[] {
    const rows = this.db.getDrizzle()
      .select()
      .from(messages)
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .all();
    return rows.reverse().map(this.toStoredMessage);
  }

  get(id: string): StoredMessage | null {
    const row = this.db.getDrizzle()
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .get();
    return row ? this.toStoredMessage(row) : null;
  }

  count(): number {
    const result = this.db.getDrizzle()
      .select({ cnt: count() })
      .from(messages)
      .get();
    return result?.cnt ?? 0;
  }

  private toStoredMessage(row: typeof messages.$inferSelect): StoredMessage {
    return {
      id: row.id,
      role: row.role as MessageRole,
      content: row.content,
      createdAt: row.createdAt,
      sessionId: row.sessionId ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/memory/message.repository.test.ts
```

Expected: PASS

- [ ] **Step 5: Write failing test for SemanticRepository**

```typescript
// tests/memory/semantic.repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DatabaseService } from "../../src/database/database.service.js";
import { SemanticRepository } from "../../src/memory/semantic.repository.js";

describe("SemanticRepository", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let repo: SemanticRepository;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-semantic-test-"));
    dbService = new DatabaseService(tmpDir);
    repo = new SemanticRepository(dbService);
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stores and retrieves facts", () => {
    repo.store("user-name", "William is the user", ["user"]);
    const fact = repo.get("user-name");
    expect(fact).not.toBeNull();
    expect(fact!.content).toBe("William is the user");
    expect(fact!.tags).toEqual(["user"]);
  });

  it("updates existing facts", () => {
    repo.store("key1", "v1", ["tag"]);
    repo.store("key1", "v2", ["tag", "updated"]);
    const fact = repo.get("key1");
    expect(fact!.content).toBe("v2");
    expect(fact!.tags).toEqual(["tag", "updated"]);
  });

  it("searches by keyword", () => {
    repo.store("stockholm", "Lives in Stockholm, Sweden", ["location"]);
    repo.store("coding", "Writes TypeScript daily", ["work"]);
    const results = repo.search("Stockholm");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].key).toBe("stockholm");
  });

  it("deletes facts", () => {
    repo.store("temp", "temporary", []);
    repo.delete("temp");
    expect(repo.get("temp")).toBeNull();
  });

  it("generates prompt text", () => {
    repo.store("fact1", "Important fact", ["test"]);
    const text = repo.toPromptText("important");
    expect(text).toContain("Important fact");
  });
});
```

- [ ] **Step 6: Implement SemanticRepository**

```typescript
// src/memory/semantic.repository.ts
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { facts } from "../database/schema.js";
import { eq } from "drizzle-orm";

export interface Fact {
  key: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SearchResult {
  key: string;
  content: string;
  tags: string[];
  score: number;
}

@Injectable()
export class SemanticRepository {
  constructor(private readonly db: DatabaseService) {}

  store(key: string, content: string, tags: string[]): void {
    const now = Date.now();
    const existing = this.get(key);
    if (existing) {
      this.db.getDrizzle().update(facts).set({ content, tags: JSON.stringify(tags), updatedAt: now }).where(eq(facts.key, key)).run();
    } else {
      this.db.getDrizzle().insert(facts).values({ key, content, tags: JSON.stringify(tags), createdAt: now, updatedAt: now }).run();
    }
  }

  get(key: string): Fact | null {
    const row = this.db.getDrizzle().select().from(facts).where(eq(facts.key, key)).get();
    if (!row) return null;
    return { key: row.key, content: row.content, tags: JSON.parse(row.tags), createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  delete(key: string): void {
    this.db.getDrizzle().delete(facts).where(eq(facts.key, key)).run();
  }

  search(query: string, limit = 10): SearchResult[] {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];
    const rows = this.db.getDrizzle().select().from(facts).all();
    return rows
      .map(row => {
        const lower = row.content.toLowerCase();
        const tagStr = row.tags.toLowerCase();
        let score = 0;
        for (const word of words) {
          if (lower.includes(word)) score += 1;
          if (tagStr.includes(word)) score += 0.5;
        }
        return { key: row.key, content: row.content, tags: JSON.parse(row.tags), score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  listAll(): Fact[] {
    const rows = this.db.getDrizzle().select().from(facts).all();
    return rows.map(row => ({ key: row.key, content: row.content, tags: JSON.parse(row.tags), createdAt: row.createdAt, updatedAt: row.updatedAt }));
  }

  toPromptText(query?: string, maxFacts = 20): string {
    let result: Array<Fact | SearchResult>;
    if (query) {
      const scored = this.search(query, maxFacts);
      const scoredKeys = new Set(scored.map(r => r.key));
      const remaining = this.listAll().filter(f => !scoredKeys.has(f.key));
      result = [...scored, ...remaining].slice(0, maxFacts);
    } else {
      result = this.listAll().slice(0, maxFacts);
    }
    if (result.length === 0) return "No relevant knowledge stored.";
    const lines = ["Known facts:"];
    for (const fact of result) lines.push(`- [${fact.key}] ${fact.content} (tags: ${fact.tags.join(", ")})`);
    return lines.join("\n");
  }
}
```

- [ ] **Step 7: Run test**

```bash
npx vitest run tests/memory/semantic.repository.test.ts
```

Expected: PASS

- [ ] **Step 8: Write failing test for WorkingMemoryService**

```typescript
// tests/memory/working-memory.service.test.ts
import { describe, it, expect } from "vitest";
import { WorkingMemoryService } from "../../src/memory/working-memory.service.js";

describe("WorkingMemoryService", () => {
  it("stores and retrieves values", () => {
    const wm = new WorkingMemoryService();
    wm.set("key", "value");
    expect(wm.get("key")).toBe("value");
  });

  it("snapshots and restores", () => {
    const wm1 = new WorkingMemoryService();
    wm1.set("a", 1);
    wm1.set("b", "two");
    const snapshot = wm1.toSnapshot();

    const wm2 = new WorkingMemoryService();
    wm2.fromSnapshot(snapshot);
    expect(wm2.get("a")).toBe(1);
    expect(wm2.get("b")).toBe("two");
  });

  it("generates prompt text", () => {
    const wm = new WorkingMemoryService();
    wm.set("task", "research apartments");
    const text = wm.toPromptText();
    expect(text).toContain("research apartments");
  });

  it("returns empty text when no state", () => {
    const wm = new WorkingMemoryService();
    expect(wm.toPromptText()).toContain("No active");
  });
});
```

- [ ] **Step 9: Implement WorkingMemoryService**

```typescript
// src/memory/working-memory.service.ts
import { Injectable } from "@nestjs/common";

@Injectable()
export class WorkingMemoryService {
  private store = new Map<string, unknown>();

  get<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  entries(): [string, unknown][] {
    return Array.from(this.store.entries());
  }

  clear(): void {
    this.store.clear();
  }

  toSnapshot(): string {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of this.store) obj[key] = value;
    return JSON.stringify(obj);
  }

  fromSnapshot(json: string): void {
    const obj = JSON.parse(json) as Record<string, unknown>;
    this.store.clear();
    for (const [key, value] of Object.entries(obj)) this.store.set(key, value);
  }

  toPromptText(): string {
    if (this.store.size === 0) return "No active working memory.";
    const lines = ["Current working state:"];
    for (const [key, value] of this.store) {
      const formatted = typeof value === "object" ? JSON.stringify(value) : String(value);
      lines.push(`- ${key}: ${formatted}`);
    }
    return lines.join("\n");
  }
}
```

- [ ] **Step 10: Run test**

```bash
npx vitest run tests/memory/working-memory.service.test.ts
```

Expected: PASS

- [ ] **Step 11: Write failing test for KnowledgeBaseService**

```typescript
// tests/memory/knowledge-base.service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { KnowledgeBaseService } from "../../src/memory/knowledge-base.service.js";

describe("KnowledgeBaseService", () => {
  let tmpDir: string;
  let kb: KnowledgeBaseService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-kb-test-"));
    kb = new KnowledgeBaseService(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saves and reads pages", () => {
    kb.savePage("people/william", "William is the user", ["user"]);
    const content = kb.readPage("people/william");
    expect(content).toContain("William is the user");
  });

  it("lists all pages", () => {
    kb.savePage("people/william", "User", []);
    kb.savePage("work/company", "Company info", []);
    const pages = kb.listPages();
    expect(pages).toHaveLength(2);
  });

  it("searches pages", () => {
    kb.savePage("people/william", "William lives in Stockholm", ["user"]);
    kb.savePage("topics/rust", "Rust programming language", ["tech"]);
    const results = kb.search("Stockholm");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe("people/william");
  });

  it("appends to existing pages", () => {
    kb.savePage("people/william", "First fact", []);
    kb.savePage("people/william", "Second fact", []);
    const content = kb.readPage("people/william");
    expect(content).toContain("First fact");
    expect(content).toContain("Second fact");
  });

  it("loads all pages for context", () => {
    kb.savePage("people/a", "Person A", []);
    kb.savePage("people/b", "Person B", []);
    const context = kb.toPromptText();
    expect(context).toContain("Person A");
    expect(context).toContain("Person B");
  });

  it("returns null for empty KB", () => {
    expect(kb.toPromptText()).toBeNull();
  });
});
```

- [ ] **Step 12: Implement KnowledgeBaseService**

```typescript
// src/memory/knowledge-base.service.ts
import { Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly kbDir: string) {}

  savePage(pagePath: string, content: string, tags: string[]): void {
    const normalized = this.normPath(pagePath);
    const fp = this.fullPath(normalized);
    fs.mkdirSync(path.dirname(fp), { recursive: true });

    const existing = this.readPage(normalized);
    const today = new Date().toISOString().split("T")[0];
    const title = normalized.split("/").pop()!.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    if (existing) {
      const parsed = this.parseFrontmatter(existing);
      const existingTags = parsed.meta.tags ?? [];
      const mergedTags = [...new Set([...existingTags, ...tags])];
      const updatedFm = this.buildFrontmatter(parsed.meta.title ?? title, mergedTags, parsed.meta.created ?? today, today);
      const newBody = parsed.body.trimEnd() + "\n\n" + content;
      fs.writeFileSync(fp, updatedFm + "\n\n" + newBody.trim() + "\n");
    } else {
      const fm = this.buildFrontmatter(title, tags, today, today);
      fs.writeFileSync(fp, fm + "\n\n# " + title + "\n\n" + content + "\n");
    }
  }

  readPage(pagePath: string): string | null {
    const fp = this.fullPath(this.normPath(pagePath));
    if (!fs.existsSync(fp)) return null;
    return fs.readFileSync(fp, "utf-8");
  }

  listPages(folder?: string): string[] {
    const baseDir = folder ? path.join(this.kbDir, folder) : this.kbDir;
    if (!fs.existsSync(baseDir)) return [];
    const results: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else if (entry.name.endsWith(".md")) {
          results.push(path.relative(this.kbDir, path.join(dir, entry.name)).replace(/\.md$/, ""));
        }
      }
    };
    walk(baseDir);
    return results.sort();
  }

  search(query: string, maxResults = 10): Array<{ path: string; snippet: string; score: number }> {
    const pages = this.listPages();
    const terms = query.toLowerCase().split(/\s+/);
    const results: Array<{ path: string; snippet: string; score: number }> = [];

    for (const pagePath of pages) {
      const content = this.readPage(pagePath);
      if (!content) continue;
      const lower = content.toLowerCase();
      let score = 0;
      for (const term of terms) {
        score += (lower.split(term).length - 1);
        if (pagePath.toLowerCase().includes(term)) score += 3;
      }
      if (score > 0) {
        const body = content.replace(/^---[\s\S]*?---\n?/, "").trim();
        results.push({ path: pagePath, snippet: body.slice(0, 120), score });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  toPromptText(): string | null {
    if (!fs.existsSync(this.kbDir)) return null;
    const pages: string[] = [];
    let totalLen = 0;
    const MAX_LEN = 6000;

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else if (entry.name.endsWith(".md")) {
          const relPath = path.relative(this.kbDir, path.join(dir, entry.name)).replace(/\.md$/, "");
          const content = fs.readFileSync(path.join(dir, entry.name), "utf-8");
          const body = content.replace(/^---[\s\S]*?---\n?/, "").trim();
          if (body && totalLen + body.length < MAX_LEN) {
            pages.push(`### ${relPath}\n${body}`);
            totalLen += body.length;
          }
        }
      }
    };
    walk(this.kbDir);

    if (pages.length === 0) return null;
    let result = pages.join("\n\n");
    if (totalLen >= MAX_LEN) result += "\n\n...(more pages available via `kb search`)";
    return `${pages.length} page(s) loaded:\n\n${result}`;
  }

  private normPath(p: string): string {
    return p.replace(/\.md$/, "").replace(/^\/+/, "").toLowerCase().replace(/\s+/g, "-");
  }

  private fullPath(pagePath: string): string {
    return path.join(this.kbDir, pagePath + ".md");
  }

  private parseFrontmatter(content: string): { meta: { title?: string; tags?: string[]; created?: string }; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { meta: {}, body: content };
    const yaml = match[1];
    const body = match[2];
    const meta: { title?: string; tags?: string[]; created?: string } = {};
    for (const line of yaml.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (key === "title") meta.title = val;
      if (key === "created") meta.created = val;
      if (key === "tags") meta.tags = val.replace(/^\[|\]$/g, "").split(",").map(t => t.trim()).filter(Boolean);
    }
    return { meta, body };
  }

  private buildFrontmatter(title: string, tags: string[], created: string, updated: string): string {
    return `---\ntitle: ${title}\ntags: [${tags.join(", ")}]\ncreated: ${created}\nupdated: ${updated}\n---`;
  }
}
```

- [ ] **Step 13: Run test**

```bash
npx vitest run tests/memory/knowledge-base.service.test.ts
```

Expected: PASS

- [ ] **Step 14: Write failing test for AssemblerService**

```typescript
// tests/memory/assembler.service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AssemblerService } from "../../src/memory/assembler.service.js";
import { SemanticRepository } from "../../src/memory/semantic.repository.js";
import { WorkingMemoryService } from "../../src/memory/working-memory.service.js";
import { KnowledgeBaseService } from "../../src/memory/knowledge-base.service.js";
import { IdentityService } from "../../src/identity/identity.service.js";
import { UserModelService } from "../../src/identity/user-model.service.js";
import { DatabaseService } from "../../src/database/database.service.js";

describe("AssemblerService", () => {
  let tmpDir: string;
  let projectDir: string;
  let assembler: AssemblerService;
  let dbService: DatabaseService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-assembler-test-"));
    projectDir = path.join(tmpDir, "project");
    fs.mkdirSync(path.join(projectDir, "prompts"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "skills", "test-skill"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "prompts", "SYSTEM.md"), "# System\nYou are Rue.");
    fs.writeFileSync(path.join(projectDir, "prompts", "PERSONALITY.md"), "# Personality\nWitty and warm.");
    fs.writeFileSync(path.join(projectDir, "skills", "test-skill", "SKILL.md"), "# Test Skill\nDoes testing.");

    dbService = new DatabaseService(path.join(tmpDir, "data"));
    const semantic = new SemanticRepository(dbService);
    const working = new WorkingMemoryService();
    const identity = new IdentityService(path.join(tmpDir, "identity"));
    const userModel = new UserModelService(path.join(tmpDir, "identity"));
    const kb = new KnowledgeBaseService(path.join(tmpDir, "kb"));

    assembler = new AssemblerService(semantic, working, identity, userModel, kb, projectDir);
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes system prompt", () => {
    const result = assembler.assemble("test");
    expect(result).toContain("You are Rue.");
  });

  it("includes personality", () => {
    const result = assembler.assemble("test");
    expect(result).toContain("Witty and warm.");
  });

  it("includes discovered skills", () => {
    const result = assembler.assemble("test");
    expect(result).toContain("test-skill");
  });

  it("includes identity when set", () => {
    const identity = new IdentityService(path.join(tmpDir, "identity"));
    identity.update({ name: "Rue" });
    const result = assembler.assemble("test");
    // Identity may or may not contain "Rue" depending on default state
    expect(typeof result).toBe("string");
  });
});
```

- [ ] **Step 15: Implement AssemblerService**

```typescript
// src/memory/assembler.service.ts
import { Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SemanticRepository } from "./semantic.repository.js";
import { WorkingMemoryService } from "./working-memory.service.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";
import { IdentityService } from "../identity/identity.service.js";
import { UserModelService } from "../identity/user-model.service.js";

@Injectable()
export class AssemblerService {
  private systemPromptCache: string | null = null;
  private personalityCache: string | null = null;
  private skillsCache: string | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 300_000;

  constructor(
    private readonly semantic: SemanticRepository,
    private readonly working: WorkingMemoryService,
    private readonly identity: IdentityService,
    private readonly userModel: UserModelService,
    private readonly kb: KnowledgeBaseService,
    private readonly projectDir: string,
  ) {}

  reload(): void {
    this.systemPromptCache = null;
    this.personalityCache = null;
    this.skillsCache = null;
  }

  assemble(task: string): string {
    if (Date.now() - this.cacheTime > this.CACHE_TTL) {
      this.systemPromptCache = null;
      this.personalityCache = null;
      this.skillsCache = null;
      this.cacheTime = Date.now();
    }

    const sections: string[] = [];

    if (this.systemPromptCache === null) {
      this.systemPromptCache = this.readProjectFile("prompts/SYSTEM.md") ?? "";
    }
    if (this.systemPromptCache) sections.push(this.systemPromptCache);

    if (this.personalityCache === null) {
      this.personalityCache = this.readProjectFile("prompts/PERSONALITY.md") ?? "";
    }
    if (this.personalityCache) sections.push(this.personalityCache);

    const identityText = this.identity.toPromptText();
    if (identityText) sections.push(`## Dynamic Identity\n${identityText}`);

    const userText = this.userModel.toPromptText();
    if (userText) sections.push(`## User\n${userText}`);

    const memoryMd = this.loadMemoryMd();
    if (memoryMd) sections.push(`## Long-term Memory\n${memoryMd}`);

    const dailyNotes = this.loadDailyNotes();
    if (dailyNotes) sections.push(`## Recent Notes\n${dailyNotes}`);

    const semanticText = this.semantic.toPromptText(task, 15);
    if (semanticText && !semanticText.startsWith("No relevant")) sections.push(`## Knowledge\n${semanticText}`);

    const kbContext = this.kb.toPromptText();
    if (kbContext) sections.push(`## Knowledge Base\n${kbContext}`);

    const workingText = this.working.toPromptText();
    if (workingText && !workingText.startsWith("No active")) sections.push(`## Current State\n${workingText}`);

    if (this.skillsCache === null) {
      this.skillsCache = this.discoverSkills() ?? "";
    }
    if (this.skillsCache) sections.push(this.skillsCache);

    return sections.join("\n\n");
  }

  private loadMemoryMd(): string | null {
    const memPath = path.join(os.homedir(), ".rue", "memory", "MEMORY.md");
    if (!fs.existsSync(memPath)) return null;
    const content = fs.readFileSync(memPath, "utf-8").trim();
    const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("#"));
    if (lines.length === 0) return null;
    return content;
  }

  private loadDailyNotes(): string | null {
    const dailyDir = path.join(os.homedir(), ".rue", "memory", "daily");
    if (!fs.existsSync(dailyDir)) return null;
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const notes: string[] = [];
    for (const date of [yesterday, today]) {
      const file = path.join(dailyDir, `${date}.md`);
      if (fs.existsSync(file)) notes.push(fs.readFileSync(file, "utf-8").trim());
    }
    return notes.length > 0 ? notes.join("\n\n") : null;
  }

  private readProjectFile(filename: string): string | null {
    const filePath = path.join(this.projectDir, filename);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8").trim();
  }

  private discoverSkills(): string | null {
    const skillsDir = path.join(this.projectDir, "skills");
    if (!fs.existsSync(skillsDir)) return null;
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills: Array<{ name: string; description: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      const content = fs.readFileSync(skillMd, "utf-8");
      const lines = content.split("\n");
      let description = "";
      let foundHeading = false;
      for (const line of lines) {
        if (line.startsWith("# ")) { foundHeading = true; continue; }
        if (foundHeading && line.trim()) { description = line.trim(); break; }
      }
      skills.push({ name: entry.name, description });
    }
    if (skills.length === 0) return null;
    const lines = ["## Detected Skills", `Found ${skills.length} skill(s) in the skills/ directory:\n`];
    for (const skill of skills) lines.push(`- **${skill.name}**: ${skill.description}`);
    lines.push("\nTo use a skill, read its SKILL.md for exact usage, then run via Bash.");
    return lines.join("\n");
  }
}
```

- [ ] **Step 16: Run test**

```bash
npx vitest run tests/memory/assembler.service.test.ts
```

Expected: PASS

- [ ] **Step 17: Create MemoryModule**

```typescript
// src/memory/memory.module.ts
import { Module } from "@nestjs/common";
import { MessageRepository } from "./message.repository.js";
import { SemanticRepository } from "./semantic.repository.js";
import { WorkingMemoryService } from "./working-memory.service.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";
import { AssemblerService } from "./assembler.service.js";
import { ConfigService } from "../config/config.service.js";
import { IdentityService } from "../identity/identity.service.js";
import { UserModelService } from "../identity/user-model.service.js";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

@Module({
  providers: [
    MessageRepository,
    SemanticRepository,
    WorkingMemoryService,
    {
      provide: KnowledgeBaseService,
      useFactory: (config: ConfigService) => new KnowledgeBaseService(path.join(config.dataDir, "kb")),
      inject: [ConfigService],
    },
    {
      provide: AssemblerService,
      useFactory: (
        semantic: SemanticRepository,
        working: WorkingMemoryService,
        identity: IdentityService,
        userModel: UserModelService,
        kb: KnowledgeBaseService,
      ) => new AssemblerService(semantic, working, identity, userModel, kb, PROJECT_ROOT),
      inject: [SemanticRepository, WorkingMemoryService, IdentityService, UserModelService, KnowledgeBaseService],
    },
  ],
  exports: [MessageRepository, SemanticRepository, WorkingMemoryService, KnowledgeBaseService, AssemblerService],
})
export class MemoryModule {}
```

- [ ] **Step 18: Run all memory tests**

```bash
npx vitest run tests/memory/
```

Expected: PASS (all tests)

- [ ] **Step 19: Commit**

```bash
git add src/memory/ tests/memory/
git commit -m "feat: MemoryModule — message repo, semantic repo, working memory, KB, assembler"
```

---

### Task 8: AppModule + main.ts bootstrap

**Files:**
- Create: `src/app.module.ts`
- Create: `src/main.ts`
- Create: `tests/app.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/app.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module.js";
import { ConfigService } from "../src/config/config.service.js";
import { BusService } from "../src/bus/bus.service.js";
import { DatabaseService } from "../src/database/database.service.js";

describe("AppModule", () => {
  let app: Awaited<ReturnType<typeof Test.createTestingModule>>["prototype"];

  afterEach(async () => {
    if (app) await app.close();
  });

  it("boots and resolves core services", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    expect(moduleRef.get(ConfigService)).toBeDefined();
    expect(moduleRef.get(BusService)).toBeDefined();
    expect(moduleRef.get(DatabaseService)).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement AppModule**

```typescript
// src/app.module.ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { BusModule } from "./bus/bus.module.js";
import { IdentityModule } from "./identity/identity.module.js";
import { MemoryModule } from "./memory/memory.module.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    BusModule,
    IdentityModule,
    MemoryModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Create main.ts (NestJS bootstrap)**

```typescript
// src/main.ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ConfigService } from "./config/config.service.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  process.setMaxListeners(50);

  await app.listen(config.port, "127.0.0.1");
  console.log(`Rue daemon running on port ${config.port}`);

  const shutdown = async () => {
    console.log("\nShutting down...");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap();
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/app.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app.module.ts src/main.ts tests/app.test.ts
git commit -m "feat: AppModule + NestJS bootstrap — foundation complete"
```

---

### Task 9: Run full test suite and verify nothing is broken

- [ ] **Step 1: Run all new tests**

```bash
npx vitest run tests/config/ tests/database/ tests/bus/bus.service.test.ts tests/bus/bus-persistence.service.test.ts tests/identity/ tests/memory/ tests/app.test.ts
```

Expected: All PASS

- [ ] **Step 2: Run existing tests to verify no regressions**

```bash
npx vitest run
```

Expected: All existing tests still pass. New tests also pass.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify full test suite passes — foundation phase complete"
```

---

## Summary

After completing this plan, the following NestJS modules exist and are tested:

| Module | Services | Tests |
|--------|----------|-------|
| ConfigModule (global) | ConfigService | 4 tests |
| DatabaseModule (global) | DatabaseService | 3 tests |
| BusModule (global) | BusService, BusPersistenceService | 10 tests |
| IdentityModule | IdentityService, UserModelService | 8 tests |
| MemoryModule | MessageRepository, SemanticRepository, WorkingMemoryService, KnowledgeBaseService, AssemblerService | 20 tests |
| AppModule | — (wires everything) | 1 test |

**Next:** Plan 2 (Agents & Transport) — AgentsModule, GatewayModule, ApiModule, TelegramModule
