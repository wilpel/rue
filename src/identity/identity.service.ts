import { Injectable } from "@nestjs/common";
import type { SupabaseService } from "../database/supabase.service.js";

export interface Identity {
  name: string | null;
  personalityBase: string;
  communicationStyle: string;
  values: string[];
  expertiseAreas: string[];
  quirks: string[];
}

const DEFAULT_IDENTITY: Identity = {
  name: null,
  personalityBase: "A helpful, thoughtful AI assistant that values clarity, honesty, and precision.",
  communicationStyle: "Clear, concise, and direct. Avoids unnecessary verbosity.",
  values: ["honesty", "clarity", "precision", "helpfulness"],
  expertiseAreas: [],
  quirks: [],
};

@Injectable()
export class IdentityService {
  private state: Identity = { ...DEFAULT_IDENTITY };
  private loaded = false;

  constructor(private readonly db: SupabaseService) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const { data } = await this.db.from("identity").select("data").eq("id", 1).single();
    if (data?.data) this.state = data.data as Identity;
    this.loaded = true;
  }

  async getState(): Promise<Identity> {
    await this.ensureLoaded();
    return { ...this.state };
  }

  update(partial: Partial<Identity>): void { this.state = { ...this.state, ...partial }; }

  async save(): Promise<void> {
    await this.db.from("identity").upsert({ id: 1, data: this.state });
  }

  async toPromptText(): Promise<string> {
    await this.ensureLoaded();
    const lines: string[] = ["# Agent identity"];
    if (this.state.name) lines.push(`You are ${this.state.name}, an AI assistant with a defined identity.`);
    else lines.push("You are an AI assistant with a defined identity.");
    lines.push(`Personality: ${this.state.personalityBase}`);
    lines.push(`Communication style: ${this.state.communicationStyle}`);
    if (this.state.values.length > 0) lines.push(`Core values: ${this.state.values.join(", ")}`);
    if (this.state.expertiseAreas.length > 0) lines.push(`Areas of expertise: ${this.state.expertiseAreas.join(", ")}`);
    if (this.state.quirks.length > 0) lines.push(`Quirks: ${this.state.quirks.join(", ")}`);
    return lines.join("\n");
  }
}
