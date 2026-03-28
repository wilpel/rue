import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ContextAssembler } from "../../../../src/cortex/limbic/memory/assembler.js";
import { SemanticMemory } from "../../../../src/cortex/limbic/memory/semantic.js";
import { WorkingMemory } from "../../../../src/cortex/limbic/memory/working.js";
import { IdentityCore } from "../../../../src/cortex/limbic/identity/core.js";
import { UserModel } from "../../../../src/cortex/limbic/identity/user-model.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("ContextAssembler", () => {
  let tmpDir: string;
  let assembler: ContextAssembler;
  let semantic: SemanticMemory;
  let working: WorkingMemory;
  let identity: IdentityCore;
  let userModel: UserModel;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-ctx-test-"));
    semantic = new SemanticMemory(path.join(tmpDir, "semantic"));
    working = new WorkingMemory();
    identity = new IdentityCore(path.join(tmpDir, "identity"));
    userModel = new UserModel(path.join(tmpDir, "identity"));
    assembler = new ContextAssembler({ semantic, working, identity, userModel, projectDir: tmpDir });
  });

  afterEach(() => {
    semantic.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("assembles a complete system prompt", () => {
    identity.update({ name: "Rue" });
    userModel.update({ name: "William" });
    semantic.store("stack", "TypeScript + Node.js", ["tech"]);
    working.set("activeTask", "refactor auth");
    const prompt = assembler.assemble("refactor the auth module");
    expect(prompt).toContain("Rue");
    expect(prompt).toContain("William");
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("refactor auth");
  });

  it("works with empty memory and identity", () => {
    const prompt = assembler.assemble("hello");
    expect(prompt).toBeTypeOf("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("includes semantic memories relevant to the task", () => {
    semantic.store("auth", "Auth uses JWT tokens with RSA256", ["security"]);
    semantic.store("food", "User likes pizza", ["personal"]);
    const prompt = assembler.assemble("fix the auth JWT validation");
    expect(prompt).toContain("JWT");
  });

  it("includes working memory state", () => {
    working.set("currentAgent", "agent_123");
    working.set("pendingReview", true);
    const prompt = assembler.assemble("check agent status");
    expect(prompt).toContain("agent_123");
    expect(prompt).toContain("pendingReview");
  });

  it("returns sections in order: identity, user, semantic, working", () => {
    identity.update({ name: "Rue" });
    userModel.update({ name: "William" });
    semantic.store("fact", "important fact", ["test"]);
    working.set("state", "active");
    const prompt = assembler.assemble("test");
    const identityPos = prompt.indexOf("Rue");
    const userPos = prompt.indexOf("William");
    const factPos = prompt.indexOf("important fact");
    const workingPos = prompt.indexOf("state");
    expect(identityPos).toBeLessThan(userPos);
    expect(userPos).toBeLessThan(factPos);
    expect(factPos).toBeLessThan(workingPos);
  });
});
