import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ConsolidationService } from "../../src/memory/consolidation.service.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { MessageRepository } from "../../src/memory/message.repository.js";
import { BusService } from "../../src/bus/bus.service.js";
import type { DelegateService } from "../../src/agents/delegate.service.js";
import type { SemanticRepository } from "../../src/memory/semantic.repository.js";
import type { KnowledgeBaseService } from "../../src/memory/knowledge-base.service.js";
import type { IdentityService } from "../../src/identity/identity.service.js";
import type { UserModelService } from "../../src/identity/user-model.service.js";
import type { WorkspaceService } from "../../src/memory/workspace.service.js";
import type { ConfigService } from "../../src/config/config.service.js";

describe("ConsolidationService", () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let msgRepo: MessageRepository;
  let bus: BusService;
  let mockDelegate: DelegateService;
  let mockWorkspace: WorkspaceService;
  let svc: ConsolidationService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-consolidation-test-"));
    dbService = new DatabaseService(tmpDir);
    msgRepo = new MessageRepository(dbService);
    bus = new BusService();
    mockDelegate = { spawn: vi.fn().mockResolvedValue(undefined) } as unknown as DelegateService;
    mockWorkspace = { postSignal: vi.fn() } as unknown as WorkspaceService;
    const mockSemantic = { toPromptText: vi.fn().mockReturnValue("No facts.") } as unknown as SemanticRepository;
    const mockKb = { toPromptText: vi.fn().mockReturnValue(null) } as unknown as KnowledgeBaseService;
    const mockIdentity = { toPromptText: vi.fn().mockReturnValue("Identity.") } as unknown as IdentityService;
    const mockUserModel = { toPromptText: vi.fn().mockReturnValue("User.") } as unknown as UserModelService;
    const mockConfig = {
      consolidation: {
        triage: { enabled: false, intervalMs: 7_200_000, minNewMessages: 3 },
        consolidation: { enabled: false, intervalMs: 86_400_000 },
        synthesis: { enabled: false, intervalMs: 604_800_000 },
      },
    } as unknown as ConfigService;

    svc = new ConsolidationService(mockDelegate, msgRepo, mockSemantic, mockKb, mockIdentity, mockUserModel, mockWorkspace, dbService, bus, mockConfig);
  });

  afterEach(() => {
    svc.onModuleDestroy();
    dbService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("triage", () => {
    it("spawns trivial delegate for new messages", async () => {
      for (let i = 0; i < 5; i++) {
        msgRepo.append({ role: "user", content: `message ${i}` });
      }
      await svc.triage();
      expect(mockDelegate.spawn).toHaveBeenCalledWith(
        expect.stringContaining("TRIAGE"),
        0, undefined,
        { name: "Triage", complexity: "trivial" },
      );
    });

    it("skips when too few messages", async () => {
      msgRepo.append({ role: "user", content: "only one" });
      await svc.triage();
      expect(mockDelegate.spawn).not.toHaveBeenCalled();
    });

    it("updates watermark after triage", async () => {
      for (let i = 0; i < 5; i++) {
        msgRepo.append({ role: "user", content: `msg ${i}` });
      }
      await svc.triage();
      // Second triage should skip (no new messages)
      (mockDelegate.spawn as ReturnType<typeof vi.fn>).mockClear();
      await svc.triage();
      expect(mockDelegate.spawn).not.toHaveBeenCalled();
    });

    it("posts workspace signal", async () => {
      for (let i = 0; i < 5; i++) {
        msgRepo.append({ role: "user", content: `msg ${i}` });
      }
      await svc.triage();
      expect(mockWorkspace.postSignal).toHaveBeenCalledWith(expect.objectContaining({ source: "consolidation", type: "triage-complete" }));
    });
  });

  describe("consolidate", () => {
    it("spawns medium delegate", async () => {
      for (let i = 0; i < 5; i++) {
        msgRepo.append({ role: "user", content: `important msg ${i}` });
      }
      await svc.consolidate();
      expect(mockDelegate.spawn).toHaveBeenCalledWith(
        expect.stringContaining("CONSOLIDATION"),
        0, undefined,
        { name: "Consolidation", complexity: "medium" },
      );
    });

    it("skips when too few new messages", async () => {
      await svc.consolidate();
      expect(mockDelegate.spawn).not.toHaveBeenCalled();
    });
  });

  describe("synthesize", () => {
    it("spawns hard delegate", async () => {
      await svc.synthesize();
      expect(mockDelegate.spawn).toHaveBeenCalledWith(
        expect.stringContaining("CREATIVE SYNTHESIS"),
        0, undefined,
        { name: "Synthesis", complexity: "hard" },
      );
    });

    it("posts high-salience workspace signal", async () => {
      await svc.synthesize();
      expect(mockWorkspace.postSignal).toHaveBeenCalledWith(expect.objectContaining({ salience: 0.7 }));
    });
  });

  describe("guards", () => {
    it("prevents concurrent triage runs", async () => {
      for (let i = 0; i < 5; i++) {
        msgRepo.append({ role: "user", content: `msg ${i}` });
      }
      (mockDelegate.spawn as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      const first = svc.triage();
      await svc.triage(); // should skip
      await first;
      expect(mockDelegate.spawn).toHaveBeenCalledTimes(1);
    });
  });
});
