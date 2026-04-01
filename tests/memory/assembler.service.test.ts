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
    fs.writeFileSync(path.join(projectDir, "prompts", "SYSTEM.md"), "# System\nYou are Rue.\n\nMore details here.");
    fs.writeFileSync(path.join(projectDir, "prompts", "PERSONALITY.md"), "# Personality\nWitty and warm.\nLine two.\nLine three.\nLine four.");
    fs.writeFileSync(path.join(projectDir, "skills", "test-skill", "metadata.json"), JSON.stringify({ name: "test-skill", short: "Does testing." }));
    dbService = new DatabaseService(path.join(tmpDir, "data"));
    const semantic = new SemanticRepository(dbService);
    const working = new WorkingMemoryService();
    const identity = new IdentityService(path.join(tmpDir, "identity"));
    const userModel = new UserModelService(path.join(tmpDir, "identity"));
    const kb = new KnowledgeBaseService(path.join(tmpDir, "kb"));
    assembler = new AssemblerService(semantic, working, identity, userModel, kb, projectDir);
  });

  afterEach(() => { dbService.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("includes system prompt in dispatcher mode", () => {
    expect(assembler.assemble("test", undefined, "dispatcher")).toContain("You are Rue.");
  });

  it("includes personality in dispatcher mode", () => {
    expect(assembler.assemble("test", undefined, "dispatcher")).toContain("Witty and warm.");
  });

  it("includes discovered skills from metadata.json in dispatcher mode", () => {
    expect(assembler.assemble("test", undefined, "dispatcher")).toContain("test-skill");
    expect(assembler.assemble("test", undefined, "dispatcher")).toContain("Does testing.");
  });

  it("returns a string", () => {
    expect(typeof assembler.assemble("test")).toBe("string");
  });

  it("includes active delegates in dispatcher mode", () => {
    assembler.setDelegateService({
      listDelegates: () => [
        { id: "delegate-1", task: "search web for cats", status: "running", startedAt: Date.now() - 5000 },
      ],
    });
    const prompt = assembler.assemble("test", undefined, "dispatcher");
    expect(prompt).toContain("Active Delegates");
    expect(prompt).toContain("search web for cats");
    expect(prompt).toContain("running");
  });

  it("omits delegates section when none are running", () => {
    assembler.setDelegateService({
      listDelegates: () => [
        { id: "delegate-1", task: "done task", status: "completed", startedAt: Date.now() - 60000 },
      ],
    });
    const prompt = assembler.assemble("test", undefined, "dispatcher");
    expect(prompt).not.toContain("Active Delegates");
  });

  it("omits delegates section when no delegate service is set", () => {
    const prompt = assembler.assemble("test");
    expect(prompt).not.toContain("Active Delegates");
  });

  it("dispatcher mode includes only brief personality (first 3 lines)", () => {
    const prompt = assembler.assemble("test", undefined, "dispatcher");
    expect(prompt).toContain("Witty and warm.");
    expect(prompt).not.toContain("Line four.");
  });

  it("followup mode includes only first paragraph of system prompt", () => {
    const prompt = assembler.assemble("test", undefined, "followup");
    expect(prompt).toContain("You are Rue.");
    expect(prompt).not.toContain("More details here.");
  });

  it("followup mode excludes skills and personality", () => {
    const prompt = assembler.assemble("test", undefined, "followup");
    expect(prompt).not.toContain("test-skill");
    expect(prompt).not.toContain("Witty and warm.");
  });

  it("worker mode includes skills but not delegates", () => {
    assembler.setDelegateService({
      listDelegates: () => [
        { id: "delegate-1", task: "some task", status: "running", startedAt: Date.now() - 5000 },
      ],
    });
    const prompt = assembler.assemble("test", undefined, "worker");
    expect(prompt).toContain("test-skill");
    expect(prompt).not.toContain("Active Delegates");
  });

  it("does not inject KB, semantic facts, daily notes, or working memory in any mode", () => {
    for (const mode of ["dispatcher", "worker", "followup"] as const) {
      const prompt = assembler.assemble("test", undefined, mode);
      expect(prompt).not.toContain("Knowledge Base");
      expect(prompt).not.toContain("Current State");
      expect(prompt).not.toContain("Recent Notes");
      expect(prompt).not.toContain("Long-term Memory");
    }
  });
});
