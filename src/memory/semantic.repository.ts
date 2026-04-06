import { Injectable, Inject } from "@nestjs/common";
import { SupabaseService } from "../database/supabase.service.js";
import { ActivationService } from "./activation.service.js";

export interface Fact { key: string; content: string; tags: string[]; createdAt: number; updatedAt: number; accessCount: number; lastAccessedAt: number | null; }
export interface SearchResult { key: string; content: string; tags: string[]; score: number; }

@Injectable()
export class SemanticRepository {
  constructor(
    @Inject(SupabaseService) private readonly db: SupabaseService,
    @Inject(ActivationService) private readonly activation: ActivationService,
  ) {}

  async store(key: string, content: string, tags: string[]): Promise<void> {
    const now = Date.now();
    await this.db.from("facts").upsert({
      key, content, tags, created_at: now, updated_at: now, access_count: 0, last_accessed_at: null,
    }, { onConflict: "key" });
  }

  async get(key: string): Promise<Fact | null> {
    const { data } = await this.db.from("facts").select("*").eq("key", key).single();
    if (!data) return null;
    return this.toFact(data);
  }

  async delete(key: string): Promise<void> {
    await this.db.from("facts").delete().eq("key", key);
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];

    const { data: rows } = await this.db.from("facts").select("*");
    if (!rows) return [];

    const results = rows
      .map(row => {
        const lower = (row.content as string).toLowerCase();
        const tags = row.tags as string[];
        const tagStr = tags.join(" ").toLowerCase();
        let contentScore = 0;
        for (const word of words) { if (lower.includes(word)) contentScore += 1; if (tagStr.includes(word)) contentScore += 0.5; }
        if (contentScore === 0) return null;
        const { total } = this.activation.computeActivation({
          accessCount: row.access_count as number,
          lastAccessedAt: row.last_accessed_at as number | null,
          contentScore,
          tags,
        });
        return { key: row.key as string, content: row.content as string, tags, score: total };
      })
      .filter((r): r is SearchResult => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Record access for returned results (fire and forget)
    for (const r of results) this.recordAccess(r.key);

    return results;
  }

  async recordAccess(key: string): Promise<void> {
    // Increment access_count and update last_accessed_at
    const { data } = await this.db.from("facts").select("access_count").eq("key", key).single();
    if (data) {
      await this.db.from("facts").update({ access_count: (data.access_count as number) + 1, last_accessed_at: Date.now() }).eq("key", key);
    }
  }

  async listAll(): Promise<Fact[]> {
    const { data } = await this.db.from("facts").select("*");
    return (data ?? []).map(this.toFact);
  }

  async toPromptText(query?: string, maxFacts = 20): Promise<string> {
    let result: Array<Fact | SearchResult>;
    if (query) {
      const scored = await this.search(query, maxFacts);
      const scoredKeys = new Set(scored.map(r => r.key));
      const remaining = (await this.listAll()).filter(f => !scoredKeys.has(f.key));
      result = [...scored, ...remaining].slice(0, maxFacts);
    } else {
      result = (await this.listAll()).slice(0, maxFacts);
    }
    if (result.length === 0) return "No relevant knowledge stored.";
    const lines = ["Known facts:"];
    for (const fact of result) lines.push(`- [${fact.key}] ${fact.content} (tags: ${fact.tags.join(", ")})`);
    return lines.join("\n");
  }

  private toFact(row: Record<string, unknown>): Fact {
    return {
      key: row.key as string,
      content: row.content as string,
      tags: row.tags as string[],
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      accessCount: row.access_count as number,
      lastAccessedAt: row.last_accessed_at as number | null,
    };
  }
}
