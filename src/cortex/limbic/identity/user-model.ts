import * as fs from "node:fs";
import * as path from "node:path";

export interface UserProfile {
  name: string | null;
  expertise: Record<string, string>;
  preferences: string[];
  workPatterns: string[];
  currentProjects: string[];
  communicationStyle: string;
}

const DEFAULT_PROFILE: UserProfile = {
  name: null,
  expertise: {},
  preferences: [],
  workPatterns: [],
  currentProjects: [],
  communicationStyle: "",
};

export class UserModel {
  private profile: UserProfile;
  private filePath: string;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "user-profile.json");
    this.profile = this.load();
  }

  getProfile(): UserProfile {
    return {
      ...this.profile,
      expertise: { ...this.profile.expertise },
      preferences: [...this.profile.preferences],
      workPatterns: [...this.profile.workPatterns],
      currentProjects: [...this.profile.currentProjects],
    };
  }

  update(partial: Partial<UserProfile>): void {
    this.profile = { ...this.profile, ...partial };
  }

  updateExpertise(area: string, level: string): void {
    this.profile.expertise = { ...this.profile.expertise, [area]: level };
  }

  addPreference(preference: string): void {
    if (!this.profile.preferences.includes(preference)) {
      this.profile.preferences = [...this.profile.preferences, preference];
    }
  }

  save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.profile, null, 2), "utf-8");
  }

  toPromptText(): string {
    const hasData =
      this.profile.name !== null ||
      Object.keys(this.profile.expertise).length > 0 ||
      this.profile.preferences.length > 0 ||
      this.profile.workPatterns.length > 0 ||
      this.profile.currentProjects.length > 0;

    if (!hasData) {
      return "User profile: not yet learned anything about the user.";
    }

    const lines: string[] = ["# User profile"];
    if (this.profile.name) {
      lines.push(`Name: ${this.profile.name}`);
    }
    if (Object.keys(this.profile.expertise).length > 0) {
      lines.push("Expertise:");
      for (const [area, level] of Object.entries(this.profile.expertise)) {
        lines.push(`  - ${area}: ${level}`);
      }
    }
    if (this.profile.preferences.length > 0) {
      lines.push(`Preferences: ${this.profile.preferences.join(", ")}`);
    }
    if (this.profile.workPatterns.length > 0) {
      lines.push(`Work patterns: ${this.profile.workPatterns.join(", ")}`);
    }
    if (this.profile.currentProjects.length > 0) {
      lines.push(`Current projects: ${this.profile.currentProjects.join(", ")}`);
    }
    if (this.profile.communicationStyle) {
      lines.push(`Communication style: ${this.profile.communicationStyle}`);
    }
    return lines.join("\n");
  }

  private load(): UserProfile {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        return JSON.parse(raw) as UserProfile;
      } catch {
        // fall through to default
      }
    }
    return { ...DEFAULT_PROFILE, expertise: {}, preferences: [], workPatterns: [], currentProjects: [] };
  }
}
