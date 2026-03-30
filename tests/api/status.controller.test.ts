import { describe, it, expect, vi } from "vitest";
import { StatusController } from "../../src/api/status.controller.js";
import type { SupervisorService } from "../../src/agents/supervisor.service.js";
import type { MessageRepository } from "../../src/memory/message.repository.js";
import type { BusPersistenceService } from "../../src/bus/bus-persistence.service.js";

describe("StatusController", () => {
  it("returns status with empty agents", () => {
    const mockSupervisor = { listAgents: vi.fn().mockReturnValue([]) } as unknown as SupervisorService;
    const mockMessages = { recent: vi.fn().mockReturnValue([]) } as unknown as MessageRepository;
    const mockPersistence = { readTail: vi.fn().mockReturnValue([]) } as unknown as BusPersistenceService;
    const controller = new StatusController(mockSupervisor, mockMessages, mockPersistence);
    const result = controller.getStatus();
    expect(result.status).toBe("running");
    expect(result.agents).toEqual([]);
  });

  it("returns dashboard data", () => {
    const mockSupervisor = { listAgents: vi.fn().mockReturnValue([]) } as unknown as SupervisorService;
    const mockMessages = { recent: vi.fn().mockReturnValue([{ id: "m1", role: "user", content: "hi" }]) } as unknown as MessageRepository;
    const mockPersistence = { readTail: vi.fn().mockReturnValue([]) } as unknown as BusPersistenceService;
    const controller = new StatusController(mockSupervisor, mockMessages, mockPersistence);
    const result = controller.getDashboard();
    expect(result.recentMessages).toHaveLength(1);
  });
});
