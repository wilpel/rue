import { describe, it, expect, vi } from "vitest";
import { DaemonGateway } from "../../src/gateway/daemon.gateway.js";
import { BusService } from "../../src/bus/bus.service.js";
import type { SupervisorService } from "../../src/agents/supervisor.service.js";
import type { AssemblerService } from "../../src/memory/assembler.service.js";
import type { MessageRepository } from "../../src/memory/message.repository.js";

describe("DaemonGateway", () => {
  it("can be instantiated with dependencies", () => {
    const bus = new BusService();
    const mockSupervisor = { listAgents: vi.fn().mockReturnValue([]), kill: vi.fn(), steer: vi.fn() } as unknown as SupervisorService;
    const mockAssembler = { assemble: vi.fn().mockReturnValue("system prompt") } as unknown as AssemblerService;
    const mockMessages = { append: vi.fn(), recent: vi.fn().mockReturnValue([]) } as unknown as MessageRepository;

    const gateway = new DaemonGateway(bus, mockSupervisor, mockAssembler, mockMessages);
    expect(gateway).toBeDefined();
  });

  it("handleDisconnect cleans up without error", () => {
    const bus = new BusService();
    const gateway = new DaemonGateway(
      bus,
      { listAgents: vi.fn().mockReturnValue([]), kill: vi.fn(), steer: vi.fn() } as unknown as SupervisorService,
      { assemble: vi.fn() } as unknown as AssemblerService,
      { append: vi.fn(), recent: vi.fn() } as unknown as MessageRepository,
    );
    // Should not throw even with unknown client
    expect(() => gateway.handleDisconnect({} as any)).not.toThrow();
  });
});
