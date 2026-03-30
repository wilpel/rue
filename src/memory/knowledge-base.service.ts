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
        else if (entry.name.endsWith(".md")) results.push(path.relative(this.kbDir, path.join(dir, entry.name)).replace(/\.md$/, ""));
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
      for (const term of terms) { score += (lower.split(term).length - 1); if (pagePath.toLowerCase().includes(term)) score += 3; }
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
          if (body && totalLen + body.length < MAX_LEN) { pages.push(`### ${relPath}\n${body}`); totalLen += body.length; }
        }
      }
    };
    walk(this.kbDir);
    if (pages.length === 0) return null;
    let result = pages.join("\n\n");
    if (totalLen >= MAX_LEN) result += "\n\n...(more pages available via `kb search`)";
    return `${pages.length} page(s) loaded:\n\n${result}`;
  }

  private normPath(p: string): string { return p.replace(/\.md$/, "").replace(/^\/+/, "").toLowerCase().replace(/\s+/g, "-"); }
  private fullPath(pagePath: string): string { return path.join(this.kbDir, pagePath + ".md"); }

  private parseFrontmatter(content: string): { meta: { title?: string; tags?: string[]; created?: string }; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { meta: {}, body: content };
    const yaml = match[1]; const body = match[2];
    const meta: { title?: string; tags?: string[]; created?: string } = {};
    for (const line of yaml.split("\n")) {
      const colonIdx = line.indexOf(":"); if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim(); const val = line.slice(colonIdx + 1).trim();
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
