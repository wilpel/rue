import { Controller, Get, Query } from "@nestjs/common";
import { MessageRepository } from "../memory/message.repository.js";

@Controller("api")
export class HistoryController {
  constructor(private readonly messages: MessageRepository) {}

  @Get("history")
  async getHistory(@Query("limit") limit?: string) {
    const messages = await this.messages.recent(parseInt(limit ?? "50", 10));
    return { messages };
  }
}
