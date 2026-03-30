import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { KnowledgeBaseService } from "../../src/memory/knowledge-base.service.js";

describe("KnowledgeBaseService", () => {
  let tmpDir: string;
  let kb: KnowledgeBaseService;

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-kb-test-")); kb = new KnowledgeBaseService(tmpDir); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("saves and reads pages", () => {
    kb.savePage("people/william", "William is the user", ["user"]);
    expect(kb.readPage("people/william")).toContain("William is the user");
  });

  it("lists all pages", () => {
    kb.savePage("people/william", "User", []);
    kb.savePage("work/company", "Company info", []);
    expect(kb.listPages()).toHaveLength(2);
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
