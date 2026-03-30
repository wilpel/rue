import { Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";

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
  private state: Identity;
  private readonly filePath: string;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "identity.json");
    this.state = this.load();
  }

  getState(): Identity { return { ...this.state }; }

  update(partial: Partial<Identity>): void { this.state = { ...this.state, ...partial }; }

  save(): void { fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf-8"); }

  toPromptText(): string {
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

  private load(): Identity {
    if (fs.existsSync(this.filePath)) {
      try { return JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as Identity; } catch { /* fall through */ }
    }
    return { ...DEFAULT_IDENTITY };
  }
}
