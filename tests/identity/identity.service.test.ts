import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { IdentityService } from "../../src/identity/identity.service.js";

describe("IdentityService", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-identity-test-")); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("returns default identity when no file exists", () => {
    const svc = new IdentityService(tmpDir);
    const state = svc.getState();
    expect(state.name).toBeNull();
    expect(state.values).toContain("honesty");
  });

  it("updates and saves identity", () => {
    const svc = new IdentityService(tmpDir);
    svc.update({ name: "Rue" });
    svc.save();
    const svc2 = new IdentityService(tmpDir);
    expect(svc2.getState().name).toBe("Rue");
  });

  it("generates prompt text", () => {
    const svc = new IdentityService(tmpDir);
    svc.update({ name: "Rue" });
    const text = svc.toPromptText();
    expect(text).toContain("Rue");
    expect(text).toContain("identity");
  });
});
