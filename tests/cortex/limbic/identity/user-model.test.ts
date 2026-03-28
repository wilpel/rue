import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { UserModel, type UserProfile } from "../../../../src/cortex/limbic/identity/user-model.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("UserModel", () => {
  let tmpDir: string;
  let model: UserModel;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-user-test-"));
    model = new UserModel(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts with empty profile", () => {
    const profile = model.getProfile();
    expect(profile.name).toBeNull();
    expect(profile.expertise).toEqual({});
  });

  it("updates profile fields", () => {
    model.update({ name: "William" });
    expect(model.getProfile().name).toBe("William");
  });

  it("updates expertise map", () => {
    model.updateExpertise("typescript", "expert");
    model.updateExpertise("rust", "familiar");
    const profile = model.getProfile();
    expect(profile.expertise.typescript).toBe("expert");
    expect(profile.expertise.rust).toBe("familiar");
  });

  it("adds preferences", () => {
    model.addPreference("terse responses");
    model.addPreference("no emojis");
    expect(model.getProfile().preferences).toContain("terse responses");
    expect(model.getProfile().preferences).toContain("no emojis");
  });

  it("persists to disk", () => {
    model.update({ name: "William" });
    model.save();
    const model2 = new UserModel(tmpDir);
    expect(model2.getProfile().name).toBe("William");
  });

  it("generates prompt text", () => {
    model.update({ name: "William" });
    model.updateExpertise("typescript", "expert");
    model.addPreference("direct communication");
    const prompt = model.toPromptText();
    expect(prompt).toContain("William");
    expect(prompt).toContain("typescript");
    expect(prompt).toContain("direct communication");
  });

  it("handles empty profile in prompt", () => {
    const prompt = model.toPromptText();
    expect(prompt).toContain("not yet learned");
  });
});
