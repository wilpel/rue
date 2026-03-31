import { Injectable, Inject } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { facts } from "../database/schema.js";
import { eq } from "drizzle-orm";

export interface Fact { key: string; content: string; tags: string[]; createdAt: number; updatedAt: number; }
export interface SearchResult { key: string; content: string; tags: string[]; score: number; }

@Injectable()
export class SemanticRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

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
        for (const word of words) { if (lower.includes(word)) score += 1; if (tagStr.includes(word)) score += 0.5; }
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
