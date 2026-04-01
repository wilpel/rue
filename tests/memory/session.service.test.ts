import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionService } from "../../src/memory/session.service.js";

describe("SessionService", () => {
  let sessions: SessionService;

  beforeEach(() => {
    sessions = new SessionService();
  });

  it("stores and retrieves session by key", () => {
    sessions.set("chat-123", "session-abc");
    expect(sessions.get("chat-123")).toBe("session-abc");
  });

  it("returns undefined for unknown key", () => {
    expect(sessions.get("unknown")).toBeUndefined();
  });

  it("returns undefined when session has expired", () => {
    sessions.set("chat-123", "session-abc");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    expect(sessions.get("chat-123")).toBeUndefined();
    vi.useRealTimers();
  });

  it("returns session when within TTL", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    sessions.set("chat-123", "session-abc");
    vi.setSystemTime(now + 29 * 60 * 1000);
    expect(sessions.get("chat-123")).toBe("session-abc");
    vi.useRealTimers();
  });

  it("clear removes a session", () => {
    sessions.set("chat-123", "session-abc");
    sessions.clear("chat-123");
    expect(sessions.get("chat-123")).toBeUndefined();
  });
});
