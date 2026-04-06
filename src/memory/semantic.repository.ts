import { Injectable, Inject } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { ActivationService } from "./activation.service.js";
import { facts } from "../database/schema.js";
import { eq } from "drizzle-orm";

export interface Fact { key: string; content: string; tags: string[]; createdAt: number; updatedAt: number; accessCount: number; lastAccessedAt: number | null; }
export interface SearchResult { key: string; content: string; tags: string[]; score: number; }

@Injectable()
export class SemanticRepository {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ActivationService) private readonly activation: ActivationService,
  ) {}

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
    return { key: row.key, content: row.content, tags: JSON.parse(row.tags), createdAt: row.createdAt, updatedAt: row.updatedAt, accessCount: row.accessCount, lastAccessedAt: row.lastAccessedAt };
  }

  delete(key: string): void {
    this.db.getDrizzle().delete(facts).where(eq(facts.key, key)).run();
  }

  search(query: string, limit = 10): SearchResult[] {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];
    const rows = this.db.getDrizzle().select().from(facts).all();
    const results = rows
      .map(row => {
        const lower = row.content.toLowerCase();
        const tagStr = row.tags.toLowerCase();
        let contentScore = 0;
        for (const word of words) { if (lower.includes(word)) contentScore += 1; if (tagStr.includes(word)) contentScore += 0.5; }
        if (contentScore === 0) return null;
        const tags = JSON.parse(row.tags) as string[];
        const { total } = this.activation.computeActivation({
          accessCount: row.accessCount,
          lastAccessedAt: row.lastAccessedAt,
          contentScore,
          tags,
        });
        return { key: row.key, content: row.content, tags, score: total };
      })
      .filter((r): r is SearchResult => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Record access for returned results
    for (const r of results) this.recordAccess(r.key);

    return results;
  }

  recordAccess(key: string): void {
    this.db.getDb().prepare(
      "UPDATE facts SET access_count = access_count + 1, last_accessed_at = ? WHERE key = ?",
    ).run(Date.now(), key);
  }

  listAll(): Fact[] {
    const rows = this.db.getDrizzle().select().from(facts).all();
    return rows.map(row => ({ key: row.key, content: row.content, tags: JSON.parse(row.tags), createdAt: row.createdAt, updatedAt: row.updatedAt, accessCount: row.accessCount, lastAccessedAt: row.lastAccessedAt }));
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
