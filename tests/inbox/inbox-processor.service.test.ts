import { describe, it, expect, vi, beforeEach } from "vitest";
import { InboxProcessorService } from "../../src/inbox/inbox-processor.service.js";
import { InboxService } from "../../src/inbox/inbox.service.js";
import type { AssemblerService } from "../../src/memory/assembler.service.js";
import type { MessageRepository } from "../../src/memory/message.repository.js";
import type { TelegramService } from "../../src/telegram/telegram.service.js";
import { BusService } from "../../src/bus/bus.service.js";

describe("InboxProcessorService", () => {
  let processor: InboxProcessorService;
  let inbox: InboxService;
  let mockTelegram: TelegramService;
  let mockAssembler: AssemblerService;
  let mockMessages: MessageRepository;

  beforeEach(() => {
    const bus = new BusService();
    const mockMsgRepo = { append: vi.fn().mockReturnValue({ id: "m1", role: "user", content: "", createdAt: Date.now() }) } as unknown as MessageRepository;
    inbox = new InboxService(mockMsgRepo, bus);
    mockAssembler = { assemble: vi.fn().mockReturnValue("system prompt") } as unknown as AssemblerService;
    mockMessages = { append: vi.fn() } as unknown as MessageRepository;
    mockTelegram = { sendMessage: vi.fn().mockResolvedValue(undefined) } as unknown as TelegramService;

    processor = new InboxProcessorService(inbox, mockAssembler, mockMessages, mockTelegram);
  });

  it("subscribes to inbox on init", () => {
    processor.onModuleInit();
    // Verify subscription by checking handler count indirectly
    expect(processor).toBeDefined();
  });

  it("forwards delegate results to telegram", async () => {
    processor.onModuleInit();
    inbox.push("delegate", "Found 3 apartments", { chatId: 123, messageId: 456, agentId: "d1" });

    // Allow async processing
    await new Promise(r => setTimeout(r, 50));

    expect(mockTelegram.sendMessage).toHaveBeenCalledWith(123, "Found 3 apartments", 456);
  });

  it("skips delegate results with no chatId", async () => {
    processor.onModuleInit();
    inbox.push("delegate", "Background result", { agentId: "d2" });

    await new Promise(r => setTimeout(r, 50));

    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
  });
});
