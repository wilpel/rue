import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SemanticMemory } from "../../../../src/cortex/limbic/memory/semantic.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("SemanticMemory", () => {
  let tmpDir: string;
  let memory: SemanticMemory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-mem-test-"));
    memory = new SemanticMemory(tmpDir);
  });

  afterEach(() => {
    memory.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stores and retrieves a fact by key", () => {
    memory.store("project-stack", "User's project uses Express + Prisma + PostgreSQL", ["tech", "stack"]);
    const fact = memory.get("project-stack");
    expect(fact).toBeDefined();
    expect(fact!.content).toContain("Express");
    expect(fact!.tags).toContain("tech");
  });

  it("returns null for missing key", () => {
    expect(memory.get("nonexistent")).toBeNull();
  });

  it("updates existing fact", () => {
    memory.store("deploy", "Deploy script at scripts/deploy.sh", ["devops"]);
    memory.store("deploy", "Deploy script at scripts/deploy-v2.sh", ["devops"]);
    const fact = memory.get("deploy");
    expect(fact!.content).toContain("deploy-v2.sh");
  });

  it("deletes a fact", () => {
    memory.store("temp", "temporary fact", []);
    memory.delete("temp");
    expect(memory.get("temp")).toBeNull();
  });

  it("searches by text query", () => {
    memory.store("stack", "TypeScript and Node.js backend", ["tech"]);
    memory.store("food", "User likes pizza", ["personal"]);
    memory.store("framework", "Express.js with Prisma ORM", ["tech"]);
    const results = memory.search("TypeScript backend framework");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.key === "stack" || r.key === "framework")).toBe(true);
  });

  it("searches by tags", () => {
    memory.store("stack", "TypeScript backend", ["tech"]);
    memory.store("food", "Likes pizza", ["personal"]);
    const results = memory.searchByTag("tech");
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("stack");
  });

  it("lists all facts", () => {
    memory.store("a", "fact a", ["tag1"]);
    memory.store("b", "fact b", ["tag2"]);
    const all = memory.listAll();
    expect(all).toHaveLength(2);
  });

  it("persists across instances", () => {
    memory.store("persist-test", "this should survive", ["test"]);
    memory.close();
    const memory2 = new SemanticMemory(tmpDir);
    const fact = memory2.get("persist-test");
    expect(fact).toBeDefined();
    expect(fact!.content).toBe("this should survive");
    memory2.close();
  });

  it("generates prompt text from relevant facts", () => {
    memory.store("stack", "TypeScript + Node.js", ["tech"]);
    memory.store("style", "User prefers functional style", ["preference"]);
    const prompt = memory.toPromptText("code style");
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("functional style");
  });
});
