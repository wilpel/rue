import { Controller, Post, Body, HttpCode, Inject } from "@nestjs/common";
import { KnowledgeBaseService } from "../memory/knowledge-base.service.js";
import { SemanticRepository } from "../memory/semantic.repository.js";
import { IdentityService } from "../identity/identity.service.js";
import { UserModelService } from "../identity/user-model.service.js";
import { BusService } from "../bus/bus.service.js";

@Controller("api/memory")
export class MemoryController {
  constructor(
    @Inject(KnowledgeBaseService) private readonly kb: KnowledgeBaseService,
    @Inject(SemanticRepository) private readonly semantic: SemanticRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(UserModelService) private readonly userModel: UserModelService,
    @Inject(BusService) private readonly bus: BusService,
  ) {}

  @Post("kb")
  @HttpCode(200)
  async saveKb(@Body() body: { path: string; content: string; tags?: string[] }) {
    if (!body.path || !body.content) return { error: "path and content are required" };
    await this.kb.savePage(body.path, body.content, body.tags ?? []);
    this.bus.emit("memory:stored", { type: "kb", key: body.path });
    return { ok: true };
  }

  @Post("fact")
  @HttpCode(200)
  async saveFact(@Body() body: { key: string; content: string; tags?: string[] }) {
    if (!body.key || !body.content) return { error: "key and content are required" };
    await this.semantic.store(body.key, body.content, body.tags ?? []);
    this.bus.emit("memory:stored", { type: "fact", key: body.key });
    return { ok: true };
  }

  @Post("identity")
  @HttpCode(200)
  async updateIdentity(@Body() body: { field: string; value: unknown }) {
    if (!body.field) return { error: "field is required" };
    const state = await this.identity.getState();
    if (!(body.field in state)) return { error: `unknown field: ${body.field}` };
    const oldValue = state[body.field as keyof typeof state];
    this.identity.update({ [body.field]: body.value });
    await this.identity.save();
    this.bus.emit("identity:updated", { field: body.field, oldValue, newValue: body.value });
    return { ok: true };
  }

  @Post("user")
  @HttpCode(200)
  async updateUser(@Body() body: { field: string; value: unknown }) {
    if (!body.field) return { error: "field is required" };
    const profile = await this.userModel.getProfile();
    if (!(body.field in profile)) return { error: `unknown field: ${body.field}` };
    this.userModel.update({ [body.field]: body.value });
    await this.userModel.save();
    this.bus.emit("memory:stored", { type: "user", key: body.field });
    return { ok: true };
  }
}
