#!/usr/bin/env tsx

/**
 * Knowledge Base skill — Obsidian-style structured markdown vault.
 * Stores interlinked pages about people, work, projects, life, and topics.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const KB_DIR = path.join(os.homedir(), ".rue", "kb");

function getArg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

/** Normalize a page path: lowercase, no .md extension, no leading slash */
function normPath(p: string): string {
  return p.replace(/\.md$/, "").replace(/^\/+/, "").toLowerCase().replace(/\s+/g, "-");
}

function fullPath(pagePath: string): string {
  return path.join(KB_DIR, normPath(pagePath) + ".md");
}

interface PageMeta {
  title: string;
  tags: string[];
  created: string;
  updated: string;
  links: string[];
}

function parseFrontmatter(content: string): { meta: Partial<PageMeta>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const yaml = match[1];
  const body = match[2];
  const meta: Partial<PageMeta> = {};

  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();

    if (key === "title") meta.title = val;
    if (key === "created") meta.created = val;
    if (key === "updated") meta.updated = val;
    if (key === "tags") {
      meta.tags = val.replace(/^\[|\]$/g, "").split(",").map(t => t.trim()).filter(Boolean);
    }
    if (key === "links") {
      meta.links = val.replace(/^\[|\]$/g, "").split(",").map(t => t.trim()).filter(Boolean);
    }
  }

  return { meta, body };
}

function buildFrontmatter(meta: PageMeta): string {
  return `---
title: ${meta.title}
tags: [${meta.tags.join(", ")}]
created: ${meta.created}
updated: ${meta.updated}
links: [${meta.links.join(", ")}]
---`;
}

function readPage(pagePath: string): string | null {
  const fp = fullPath(pagePath);
  if (!fs.existsSync(fp)) return null;
  return fs.readFileSync(fp, "utf-8");
}

function writePage(pagePath: string, content: string): void {
  const fp = fullPath(pagePath);
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, content);
}

/** Recursively list all .md files in KB_DIR */
function listAllPages(folder?: string): string[] {
  const baseDir = folder ? path.join(KB_DIR, folder) : KB_DIR;
  if (!fs.existsSync(baseDir)) return [];

  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".md")) {
        const rel = path.relative(KB_DIR, path.join(dir, entry.name)).replace(/\.md$/, "");
        results.push(rel);
      }
    }
  };
  walk(baseDir);
  return results.sort();
}

/** Search pages by keyword. Returns matching pages with snippets. */
function searchPages(query: string, maxResults = 10): Array<{ path: string; title: string; snippet: string; score: number }> {
  const pages = listAllPages();
  const terms = query.toLowerCase().split(/\s+/);
  const results: Array<{ path: string; title: string; snippet: string; score: number }> = [];

  for (const pagePath of pages) {
    const content = readPage(pagePath);
    if (!content) continue;

    const { meta, body } = parseFrontmatter(content);
    const lower = (body + " " + (meta.tags ?? []).join(" ") + " " + (meta.title ?? "")).toLowerCase();

    let score = 0;
    for (const term of terms) {
      const matches = lower.split(term).length - 1;
      score += matches;
      // Bonus for title/tag match
      if ((meta.title ?? "").toLowerCase().includes(term)) score += 3;
      if ((meta.tags ?? []).some(t => t.toLowerCase().includes(term))) score += 2;
    }

    if (score > 0) {
      // Extract snippet around first match
      const idx = lower.indexOf(terms[0]);
      const start = Math.max(0, idx - 40);
      const end = Math.min(body.length, idx + 120);
      const snippet = body.slice(start, end).replace(/\n/g, " ").trim();

      results.push({
        path: pagePath,
        title: meta.title ?? pagePath.split("/").pop() ?? pagePath,
        snippet: snippet || body.slice(0, 120).replace(/\n/g, " ").trim(),
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

// ── CLI ─────────────────────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case "save": {
    const pagePath = getArg("path");
    const content = getArg("content");
    const tags = getArg("tags");

    if (!pagePath || !content) {
      console.error("Usage: kb save --path <page-path> --content \"...\" [--tags \"tag1,tag2\"]");
      process.exit(1);
    }

    const normalized = normPath(pagePath);
    const existing = readPage(normalized);
    const tagList = tags ? tags.split(",").map(t => t.trim()) : [];
    const title = normalized.split("/").pop()!.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    if (existing) {
      // Update existing page: append content and merge tags
      const { meta, body } = parseFrontmatter(existing);
      const existingTags = meta.tags ?? [];
      const mergedTags = [...new Set([...existingTags, ...tagList])];

      const updatedMeta: PageMeta = {
        title: meta.title ?? title,
        tags: mergedTags,
        created: meta.created ?? today(),
        updated: today(),
        links: meta.links ?? [],
      };

      const newBody = body.trimEnd() + "\n\n" + content;
      writePage(normalized, buildFrontmatter(updatedMeta) + "\n\n" + newBody.trim() + "\n");
      console.log(`Updated: ${normalized} (+${content.length} chars)`);
    } else {
      // Create new page
      const meta: PageMeta = {
        title,
        tags: tagList,
        created: today(),
        updated: today(),
        links: [],
      };

      // Extract [[wikilinks]] from content
      const wikilinks = [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => normPath(m[1]));
      meta.links = wikilinks;

      writePage(normalized, buildFrontmatter(meta) + "\n\n# " + title + "\n\n" + content + "\n");
      console.log(`Created: ${normalized}`);
    }
    break;
  }

  case "search": {
    const query = getArg("query");
    if (!query) {
      console.error("Usage: kb search --query \"...\"");
      process.exit(1);
    }

    const results = searchPages(query);
    if (results.length === 0) {
      console.log("No results found.");
    } else {
      for (const r of results) {
        console.log(`[${r.path}] ${r.title} (score: ${r.score})`);
        console.log(`  ${r.snippet}`);
        console.log();
      }
    }
    break;
  }

  case "read": {
    const pagePath = getArg("path");
    if (!pagePath) {
      console.error("Usage: kb read --path <page-path>");
      process.exit(1);
    }

    const content = readPage(normPath(pagePath));
    if (!content) {
      console.log(`Page not found: ${pagePath}`);
    } else {
      console.log(content);
    }
    break;
  }

  case "list": {
    const folder = getArg("folder");
    const pages = listAllPages(folder);

    if (pages.length === 0) {
      console.log(folder ? `No pages in ${folder}/` : "Knowledge base is empty.");
    } else {
      console.log(`${pages.length} page(s)${folder ? ` in ${folder}/` : ""}:\n`);
      // Group by folder
      const grouped = new Map<string, string[]>();
      for (const p of pages) {
        const parts = p.split("/");
        const dir = parts.length > 1 ? parts[0] : "(root)";
        if (!grouped.has(dir)) grouped.set(dir, []);
        grouped.get(dir)!.push(p);
      }
      for (const [dir, items] of grouped) {
        console.log(`${dir}/`);
        for (const item of items) {
          console.log(`  ${item}`);
        }
      }
    }
    break;
  }

  case "link": {
    const from = getArg("from");
    const to = getArg("to");
    if (!from || !to) {
      console.error("Usage: kb link --from <page> --to <page>");
      process.exit(1);
    }

    const fromNorm = normPath(from);
    const toNorm = normPath(to);

    const content = readPage(fromNorm);
    if (!content) {
      console.log(`Page not found: ${from}`);
      process.exit(1);
    }

    const { meta, body } = parseFrontmatter(content);
    const links = meta.links ?? [];
    if (!links.includes(toNorm)) {
      links.push(toNorm);
    }

    const updatedMeta: PageMeta = {
      title: meta.title ?? fromNorm,
      tags: meta.tags ?? [],
      created: meta.created ?? today(),
      updated: today(),
      links,
    };

    writePage(fromNorm, buildFrontmatter(updatedMeta) + "\n\n" + body.trim() + "\n");
    console.log(`Linked: ${fromNorm} → ${toNorm}`);
    break;
  }

  default:
    console.log("Knowledge Base — Obsidian-style structured memory");
    console.log();
    console.log("Commands:");
    console.log("  save    --path <path> --content \"...\" [--tags \"t1,t2\"]");
    console.log("  search  --query \"...\"");
    console.log("  read    --path <path>");
    console.log("  list    [--folder <name>]");
    console.log("  link    --from <page> --to <page>");
}
