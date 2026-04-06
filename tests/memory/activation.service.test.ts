import { describe, it, expect } from "vitest";
import { ActivationService } from "../../src/memory/activation.service.js";

describe("ActivationService", () => {
  const svc = new ActivationService();
  const now = Date.now();

  it("returns zero base level for zero accesses", () => {
    const result = svc.computeActivation({ accessCount: 0, lastAccessedAt: null, contentScore: 0, tags: [] }, now);
    expect(result.baseLevel).toBe(0);
    expect(result.total).toBe(0);
  });

  it("returns higher activation for more accesses", () => {
    const low = svc.computeActivation({ accessCount: 1, lastAccessedAt: now - 3600_000, contentScore: 1, tags: [] }, now);
    const high = svc.computeActivation({ accessCount: 50, lastAccessedAt: now - 3600_000, contentScore: 1, tags: [] }, now);
    expect(high.baseLevel).toBeGreaterThan(low.baseLevel);
    expect(high.total).toBeGreaterThan(low.total);
  });

  it("decays activation with age", () => {
    const recent = svc.computeActivation({ accessCount: 10, lastAccessedAt: now - 3600_000, contentScore: 1, tags: [] }, now); // 1h ago
    const old = svc.computeActivation({ accessCount: 10, lastAccessedAt: now - 7 * 86_400_000, contentScore: 1, tags: [] }, now); // 7 days ago
    expect(recent.baseLevel).toBeGreaterThan(old.baseLevel);
  });

  it("passes through content score as context match", () => {
    const result = svc.computeActivation({ accessCount: 0, lastAccessedAt: null, contentScore: 3.5, tags: [] }, now);
    expect(result.contextMatch).toBe(3.5);
  });

  it("boosts for emotional tags", () => {
    const noTags = svc.computeActivation({ accessCount: 0, lastAccessedAt: null, contentScore: 1, tags: [] }, now);
    const withTags = svc.computeActivation({ accessCount: 0, lastAccessedAt: null, contentScore: 1, tags: ["important", "personal"] }, now);
    expect(withTags.emotionalBoost).toBe(0.8); // 0.5 + 0.3
    expect(withTags.total).toBeGreaterThan(noTags.total);
  });

  it("caps emotional boost at 1.5", () => {
    const result = svc.computeActivation({ accessCount: 0, lastAccessedAt: null, contentScore: 0, tags: ["critical", "urgent", "important", "personal"] }, now);
    expect(result.emotionalBoost).toBe(1.5);
  });

  it("ignores unknown tags", () => {
    const result = svc.computeActivation({ accessCount: 0, lastAccessedAt: null, contentScore: 0, tags: ["random", "misc"] }, now);
    expect(result.emotionalBoost).toBe(0);
  });
});
