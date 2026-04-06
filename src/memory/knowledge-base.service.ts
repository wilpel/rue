import { Injectable } from "@nestjs/common";
import type { SupabaseService } from "../database/supabase.service.js";
import type { ActivationService } from "./activation.service.js";

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly db: SupabaseService,
    private readonly activation?: ActivationService,
  ) {}

  async savePage(pagePath: string, content: string, tags: string[]): Promise<void> {
    const normalized = this.normPath(pagePath);
    const today = new Date().toISOString().split("T")[0];
    const title = normalized.split("/").pop()!.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    const existing = await this.readPage(normalized);
    if (existing) {
      // Append to existing page, merge tags
      const { data: row } = await this.db.from("kb_pages").select("tags").eq("path", normalized).single();
      const existingTags = (row?.tags ?? []) as string[];
      const mergedTags = [...new Set([...existingTags, ...tags])];
      const newBody = existing.trimEnd() + "\n\n" + content;
      await this.db.from("kb_pages").update({
        content: newBody.trim(), tags: mergedTags, updated_at: today,
      }).eq("path", normalized);
    } else {
      const body = "# " + title + "\n\n" + content;
      await this.db.from("kb_pages").insert({
        path: normalized, title, content: body, tags, created_at: today, updated_at: today,
      });
    }
  }

  async readPage(pagePath: string): Promise<string | null> {
    const { data } = await this.db.from("kb_pages").select("content").eq("path", this.normPath(pagePath)).single();
    return data?.content as string | null ?? null;
  }

  async listPages(folder?: string): Promise<string[]> {
    let query = this.db.from("kb_pages").select("path").order("path");
    if (folder) {
      query = query.like("path", `${folder}%`);
    }
    const { data } = await query;
    return (data ?? []).map(r => r.path as string).sort();
  }

  async search(query: string, maxResults = 10): Promise<Array<{ path: string; snippet: string; score: number }>> {
    const terms = query.toLowerCase().split(/\s+/);
    const { data: pages } = await this.db.from("kb_pages").select("*");
    if (!pages) return [];

    const results: Array<{ path: string; snippet: string; score: number }> = [];
    for (const page of pages) {
      const content = page.content as string;
      const pagePath = page.path as string;
      const lower = content.toLowerCase();
      let contentScore = 0;
      for (const term of terms) { contentScore += (lower.split(term).length - 1); if (pagePath.toLowerCase().includes(term)) contentScore += 3; }
      if (contentScore === 0) continue;

      let score = contentScore;
      if (this.activation) {
        const { total } = this.activation.computeActivation({
          accessCount: page.access_count as number,
          lastAccessedAt: page.last_accessed_at as number | null,
          contentScore,
          tags: page.tags as string[],
        });
        score = total;
      }

      results.push({ path: pagePath, snippet: content.slice(0, 120), score });
    }

    const sorted = results.sort((a, b) => b.score - a.score).slice(0, maxResults);
    // Record access (fire and forget)
    for (const r of sorted) this.recordAccess(r.path);
    return sorted;
  }

  async toPromptText(): Promise<string | null> {
    const { data: pages } = await this.db.from("kb_pages").select("path, content").order("updated_at", { ascending: false });
    if (!pages || pages.length === 0) return null;

    const sections: string[] = [];
    let totalLen = 0;
    const MAX_LEN = 6000;

    for (const page of pages) {
      const body = (page.content as string).trim();
      if (body && totalLen + body.length < MAX_LEN) {
        sections.push(`### ${page.path}\n${body}`);
        totalLen += body.length;
      }
    }

    if (sections.length === 0) return null;
    let result = sections.join("\n\n");
    if (totalLen >= MAX_LEN) result += "\n\n...(more pages available via `kb search`)";
    return `${sections.length} page(s) loaded:\n\n${result}`;
  }

  private async recordAccess(pagePath: string): Promise<void> {
    const { data } = await this.db.from("kb_pages").select("access_count").eq("path", pagePath).single();
    if (data) {
      await this.db.from("kb_pages").update({
        access_count: (data.access_count as number) + 1,
        last_accessed_at: Date.now(),
      }).eq("path", pagePath);
    }
  }

  private normPath(p: string): string {
    return p.replace(/\.md$/, "").replace(/^\/+/, "").toLowerCase().replace(/\s+/g, "-");
  }
}
