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

  afterEach(() => { dbService.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("includes system prompt", () => { expect(assembler.assemble("test")).toContain("You are Rue."); });
  it("includes personality", () => { expect(assembler.assemble("test")).toContain("Witty and warm."); });
  it("includes discovered skills", () => { expect(assembler.assemble("test")).toContain("test-skill"); });
  it("returns a string", () => { expect(typeof assembler.assemble("test")).toBe("string"); });

  it("includes active delegates in assembled prompt when set", () => {
    assembler.setDelegateService({
      listDelegates: () => [
        { id: "delegate-1", task: "search web for cats", status: "running", startedAt: Date.now() - 5000 },
      ],
    });
    const prompt = assembler.assemble("test");
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
    const prompt = assembler.assemble("test");
    expect(prompt).not.toContain("Active Delegates");
  });

  it("omits delegates section when no delegate service is set", () => {
    const prompt = assembler.assemble("test");
    expect(prompt).not.toContain("Active Delegates");
  });
});
