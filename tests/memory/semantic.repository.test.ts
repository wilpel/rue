import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DatabaseService } from "../../src/database/database.service.js";
import { SemanticRepository } from "../../src/memory/semantic.repository.js";
import { ActivationService } from "../../src/memory/activation.service.js";

describe("SemanticRepository", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let repo: SemanticRepository;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-semantic-test-"));
    dbService = new DatabaseService(tmpDir);
    repo = new SemanticRepository(dbService, new ActivationService());
  });

  afterEach(() => {
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stores and retrieves facts", () => {
    repo.store("user-name", "William is the user", ["user"]);
    const fact = repo.get("user-name");
    expect(fact).not.toBeNull();
    expect(fact!.content).toBe("William is the user");
    expect(fact!.tags).toEqual(["user"]);
  });

  it("updates existing facts", () => {
    repo.store("key1", "v1", ["tag"]);
    repo.store("key1", "v2", ["tag", "updated"]);
    const fact = repo.get("key1");
    expect(fact!.content).toBe("v2");
    expect(fact!.tags).toEqual(["tag", "updated"]);
  });

  it("searches by keyword", () => {
    repo.store("stockholm", "Lives in Stockholm, Sweden", ["location"]);
    repo.store("coding", "Writes TypeScript daily", ["work"]);
    const results = repo.search("Stockholm");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].key).toBe("stockholm");
  });

  it("deletes facts", () => {
    repo.store("temp", "temporary", []);
    repo.delete("temp");
    expect(repo.get("temp")).toBeNull();
  });

  it("generates prompt text", () => {
    repo.store("fact1", "Important fact", ["test"]);
    const text = repo.toPromptText("important");
    expect(text).toContain("Important fact");
  });
});
