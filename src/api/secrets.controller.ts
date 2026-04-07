import { Controller, Get, Post, Delete, Param, Body, Inject } from "@nestjs/common";
import { SupabaseService } from "../database/supabase.service.js";

@Controller("api/secrets")
export class SecretsController {
  constructor(@Inject(SupabaseService) private readonly db: SupabaseService) {}

  @Get()
  async listSecrets() {
    const { data } = await this.db.from("secrets_vault").select("key").order("key");
    return { keys: (data ?? []).map((r: Record<string, unknown>) => r.key) };
  }

  @Post()
  async setSecret(@Body() body: { key: string; value: string }) {
    if (!body.key || !body.value) return { error: "key and value required" };
    // Values should be encrypted client-side via the secrets skill.
    // This endpoint stores pre-encrypted data.
    const now = Date.now();
    await this.db.from("secrets_vault").upsert({
      key: body.key, iv: body.value, tag: "", data: "", created_at: now, updated_at: now,
    }, { onConflict: "key" });
    return { ok: true };
  }

  @Delete(":key")
  async deleteSecret(@Param("key") key: string) {
    await this.db.from("secrets_vault").delete().eq("key", key);
    return { ok: true };
  }
}
