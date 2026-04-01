import { describe, it, expect, vi } from "vitest";
import { DaemonGateway } from "../../src/gateway/daemon.gateway.js";
import { BusService } from "../../src/bus/bus.service.js";
import type { SupervisorService } from "../../src/agents/supervisor.service.js";
import type { ClaudeProcessService } from "../../src/agents/claude-process.service.js";
import type { AssemblerService } from "../../src/memory/assembler.service.js";
import type { MessageRepository } from "../../src/memory/message.repository.js";
import type { SessionService } from "../../src/memory/session.service.js";
import type { DelegateService } from "../../src/agents/delegate.service.js";
import type { ConfigService } from "../../src/config/config.service.js";

function createGateway() {
  const bus = new BusService();
  const mockSupervisor = { listAgents: vi.fn().mockReturnValue([]), kill: vi.fn(), steer: vi.fn() } as unknown as SupervisorService;
  const mockProcess = { createProcess: vi.fn() } as unknown as ClaudeProcessService;
  const mockAssembler = { assemble: vi.fn().mockReturnValue("system prompt") } as unknown as AssemblerService;
  const mockMessages = { append: vi.fn(), recent: vi.fn().mockReturnValue([]) } as unknown as MessageRepository;
  const mockSessions = { get: vi.fn(), set: vi.fn(), clear: vi.fn() } as unknown as SessionService;
  const mockDelegate = { postQuestion: vi.fn(), postAnswer: vi.fn(), getAnswer: vi.fn(), getPendingQuestion: vi.fn() } as unknown as DelegateService;
  const mockConfig = { models: { primary: "test", fallback: [] }, port: 0 } as unknown as ConfigService;

  return new DaemonGateway(bus, mockSupervisor, mockProcess, mockAssembler, mockMessages, mockSessions, mockDelegate, mockConfig);
}

describe("DaemonGateway", () => {
  it("can be instantiated with dependencies", () => {
    const gateway = createGateway();
    expect(gateway).toBeDefined();
  });

  it("handleDisconnect cleans up without error", () => {
    const gateway = createGateway();
    // Should not throw even with unknown client
    expect(() => gateway.handleDisconnect({} as any)).not.toThrow();
  });
});
