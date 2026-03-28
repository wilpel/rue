import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IdentityCore, type Identity } from "../../../../src/cortex/limbic/identity/core.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("IdentityCore", () => {
  let tmpDir: string;
  let identity: IdentityCore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-id-test-"));
    identity = new IdentityCore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts with no name and default personality", () => {
    const state = identity.getState();
    expect(state.name).toBeNull();
    expect(state.personalityBase).toBeTypeOf("string");
    expect(state.personalityBase.length).toBeGreaterThan(0);
  });

  it("updates fields", () => {
    identity.update({ name: "Rue" });
    expect(identity.getState().name).toBe("Rue");
  });

  it("persists state to disk", () => {
    identity.update({ name: "Rue" });
    identity.save();
    const identity2 = new IdentityCore(tmpDir);
    expect(identity2.getState().name).toBe("Rue");
  });

  it("generates system prompt text", () => {
    identity.update({ name: "Rue" });
    const prompt = identity.toPromptText();
    expect(prompt).toContain("Rue");
    expect(prompt).toContain("identity");
  });

  it("generates prompt without name when unnamed", () => {
    const prompt = identity.toPromptText();
    expect(prompt).not.toContain("null");
    expect(prompt).toContain("assistant");
  });

  it("updates communication style", () => {
    identity.update({ communicationStyle: "terse, direct, no fluff" });
    expect(identity.getState().communicationStyle).toBe("terse, direct, no fluff");
  });

  it("tracks expertise areas", () => {
    identity.update({ expertiseAreas: ["TypeScript", "system design"] });
    expect(identity.getState().expertiseAreas).toEqual(["TypeScript", "system design"]);
  });
});
