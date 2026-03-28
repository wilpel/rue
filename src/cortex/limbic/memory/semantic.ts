import Database, { type Database as DB } from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";

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

export class SemanticMemory {
  private db: DB;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(path.join(dir, "knowledge.sqlite"));
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  store(key: string, content: string, tags: string[]): void {
    const now = Date.now();
    const existing = this.get(key);
    if (existing) {
      this.db.prepare("UPDATE facts SET content = ?, tags = ?, updated_at = ? WHERE key = ?").run(content, JSON.stringify(tags), now, key);
    } else {
      this.db.prepare("INSERT INTO facts (key, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(key, content, JSON.stringify(tags), now, now);
    }
  }

  get(key: string): Fact | null {
    const row = this.db.prepare("SELECT * FROM facts WHERE key = ?").get(key) as { key: string; content: string; tags: string; created_at: number; updated_at: number } | undefined;
    if (!row) return null;
    return { key: row.key, content: row.content, tags: JSON.parse(row.tags), createdAt: row.created_at, updatedAt: row.updated_at };
  }

  delete(key: string): void {
    this.db.prepare("DELETE FROM facts WHERE key = ?").run(key);
  }

  search(query: string, limit = 10): SearchResult[] {
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0) return [];
    const rows = this.db.prepare("SELECT * FROM facts").all() as Array<{ key: string; content: string; tags: string; created_at: number; updated_at: number }>;
    return rows
      .map((row) => {
        const lower = row.content.toLowerCase();
        const tagStr = row.tags.toLowerCase();
        let score = 0;
        for (const word of words) {
          if (lower.includes(word)) score += 1;
          if (tagStr.includes(word)) score += 0.5;
        }
        return { key: row.key, content: row.content, tags: JSON.parse(row.tags), score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  searchByTag(tag: string): SearchResult[] {
    const rows = this.db.prepare("SELECT * FROM facts WHERE tags LIKE ?").all(`%"${tag}"%`) as Array<{ key: string; content: string; tags: string; created_at: number; updated_at: number }>;
    return rows.map((row) => ({ key: row.key, content: row.content, tags: JSON.parse(row.tags), score: 1 }));
  }

  listAll(): Fact[] {
    const rows = this.db.prepare("SELECT * FROM facts ORDER BY updated_at DESC").all() as Array<{ key: string; content: string; tags: string; created_at: number; updated_at: number }>;
    return rows.map((row) => ({ key: row.key, content: row.content, tags: JSON.parse(row.tags), createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  toPromptText(query?: string, maxFacts = 20): string {
    let facts: Array<Fact | SearchResult>;
    if (query) {
      const scored = this.search(query, maxFacts);
      const scoredKeys = new Set(scored.map((r) => r.key));
      const remaining = this.listAll().filter((f) => !scoredKeys.has(f.key));
      facts = [...scored, ...remaining].slice(0, maxFacts);
    } else {
      facts = this.listAll().slice(0, maxFacts);
    }
    if (facts.length === 0) return "No relevant knowledge stored.";
    const lines: string[] = ["Known facts:"];
    for (const fact of facts) {
      lines.push(`- [${fact.key}] ${fact.content} (tags: ${fact.tags.join(", ")})`);
    }
    return lines.join("\n");
  }

  close(): void {
    this.db.close();
  }

  private initSchema(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS facts (key TEXT PRIMARY KEY, content TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  }
}
