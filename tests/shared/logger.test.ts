import { describe, it, expect, beforeEach } from "vitest";
import { createLogger, type LogEntry } from "../../src/shared/logger.js";

describe("Logger", () => {
  let entries: LogEntry[];
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    entries = [];
    logger = createLogger({ sink: (entry) => entries.push(entry) });
  });

  it("logs info messages with timestamp", () => {
    logger.info("hello world");
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("info");
    expect(entries[0].msg).toBe("hello world");
    expect(entries[0].ts).toBeTypeOf("number");
  });

  it("logs error messages with error details", () => {
    const err = new Error("boom");
    logger.error("failed", { error: err });
    expect(entries[0].level).toBe("error");
    expect(entries[0].msg).toBe("failed");
    expect(entries[0].error).toBe("boom");
  });

  it("logs with structured context", () => {
    logger.info("agent spawned", { agentId: "agent_abc", lane: "sub" });
    expect(entries[0].agentId).toBe("agent_abc");
    expect(entries[0].lane).toBe("sub");
  });

  it("creates child loggers with inherited context", () => {
    const child = logger.child({ component: "bus" });
    child.info("event emitted");
    expect(entries[0].component).toBe("bus");
    expect(entries[0].msg).toBe("event emitted");
  });

  it("supports warn and debug levels", () => {
    logger.warn("caution");
    logger.debug("trace");
    expect(entries[0].level).toBe("warn");
    expect(entries[1].level).toBe("debug");
  });
});
