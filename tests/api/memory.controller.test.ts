import { describe, it, expect, vi } from "vitest";
import { MemoryController } from "../../src/api/memory.controller.js";
import type { KnowledgeBaseService } from "../../src/memory/knowledge-base.service.js";
import type { SemanticRepository } from "../../src/memory/semantic.repository.js";
import type { IdentityService } from "../../src/identity/identity.service.js";
import type { UserModelService } from "../../src/identity/user-model.service.js";
import type { BusService } from "../../src/bus/bus.service.js";

function createController() {
  const kb = { savePage: vi.fn() } as unknown as KnowledgeBaseService;
  const semantic = { store: vi.fn() } as unknown as SemanticRepository;
  const identity = {
    getState: vi.fn().mockReturnValue({ name: "Rue", personalityBase: "", communicationStyle: "", values: [], expertiseAreas: [], quirks: [] }),
    update: vi.fn(),
    save: vi.fn(),
  } as unknown as IdentityService;
  const userModel = {
    getProfile: vi.fn().mockReturnValue({ name: null, expertise: {}, preferences: [], workPatterns: [], currentProjects: [], communicationStyle: "" }),
    update: vi.fn(),
    save: vi.fn(),
  } as unknown as UserModelService;
  const bus = { emit: vi.fn() } as unknown as BusService;
  return { controller: new MemoryController(kb, semantic, identity, userModel, bus), kb, semantic, identity, userModel, bus };
}

describe("MemoryController", () => {
  it("saves to knowledge base", () => {
    const { controller, kb, bus } = createController();
    const result = controller.saveKb({ path: "people/john", content: "John is a dev", tags: ["colleague"] });
    expect(result).toEqual({ ok: true });
    expect(kb.savePage).toHaveBeenCalledWith("people/john", "John is a dev", ["colleague"]);
    expect(bus.emit).toHaveBeenCalledWith("memory:stored", { type: "kb", key: "people/john" });
  });

  it("validates kb body", () => {
    const { controller } = createController();
    expect(controller.saveKb({ path: "", content: "test" })).toEqual({ error: "path and content are required" });
  });

  it("saves semantic fact", () => {
    const { controller, semantic } = createController();
    const result = controller.saveFact({ key: "deadline", content: "April 15", tags: ["work"] });
    expect(result).toEqual({ ok: true });
    expect(semantic.store).toHaveBeenCalledWith("deadline", "April 15", ["work"]);
  });

  it("updates identity", () => {
    const { controller, identity } = createController();
    const result = controller.updateIdentity({ field: "quirks", value: ["likes puns"] });
    expect(result).toEqual({ ok: true });
    expect(identity.update).toHaveBeenCalledWith({ quirks: ["likes puns"] });
    expect(identity.save).toHaveBeenCalled();
  });

  it("rejects unknown identity field", () => {
    const { controller } = createController();
    expect(controller.updateIdentity({ field: "nonexistent", value: "x" })).toEqual({ error: "unknown field: nonexistent" });
  });

  it("updates user profile", () => {
    const { controller, userModel } = createController();
    const result = controller.updateUser({ field: "name", value: "William" });
    expect(result).toEqual({ ok: true });
    expect(userModel.update).toHaveBeenCalledWith({ name: "William" });
    expect(userModel.save).toHaveBeenCalled();
  });

  it("rejects unknown user field", () => {
    const { controller } = createController();
    expect(controller.updateUser({ field: "nonexistent", value: "x" })).toEqual({ error: "unknown field: nonexistent" });
  });
});
