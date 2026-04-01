import { describe, it, expect } from "vitest";
import type { ChannelAdapter, InboundMessage, ChannelTarget } from "../../src/channels/channel-adapter.js";

describe("ChannelAdapter types", () => {
  it("InboundMessage has required fields", () => {
    const msg: InboundMessage = {
      channelId: "telegram", chatId: "123", senderId: "456",
      messageId: "789", text: "hello", timestamp: Date.now(),
    };
    expect(msg.channelId).toBe("telegram");
    expect(msg.text).toBe("hello");
  });

  it("ChannelTarget requires chatId", () => {
    const target: ChannelTarget = { chatId: "123" };
    expect(target.chatId).toBe("123");
    expect(target.replyToMessageId).toBeUndefined();
  });
});
