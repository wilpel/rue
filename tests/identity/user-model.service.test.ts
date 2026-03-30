import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { UserModelService } from "../../src/identity/user-model.service.js";

describe("UserModelService", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-usermodel-test-")); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("returns default profile when no file exists", () => {
    const svc = new UserModelService(tmpDir);
    expect(svc.getProfile().name).toBeNull();
  });

  it("updates and persists profile", () => {
    const svc = new UserModelService(tmpDir);
    svc.update({ name: "William" });
    svc.save();
    const svc2 = new UserModelService(tmpDir);
    expect(svc2.getProfile().name).toBe("William");
  });

  it("adds expertise", () => {
    const svc = new UserModelService(tmpDir);
    svc.updateExpertise("TypeScript", "expert");
    expect(svc.getProfile().expertise).toEqual({ TypeScript: "expert" });
  });

  it("adds preferences without duplicates", () => {
    const svc = new UserModelService(tmpDir);
    svc.addPreference("dark mode");
    svc.addPreference("dark mode");
    expect(svc.getProfile().preferences).toEqual(["dark mode"]);
  });

  it("generates prompt text", () => {
    const svc = new UserModelService(tmpDir);
    svc.update({ name: "William" });
    const text = svc.toPromptText();
    expect(text).toContain("William");
  });
});
