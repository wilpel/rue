import * as fs from "node:fs";
import * as path from "node:path";
import type { SemanticMemory } from "./semantic.js";
import type { WorkingMemory } from "./working.js";
import type { IdentityCore } from "../identity/core.js";
import type { UserModel } from "../identity/user-model.js";

export interface AssemblerDeps {
  semantic: SemanticMemory;
  working: WorkingMemory;
  identity: IdentityCore;
  userModel: UserModel;
  projectDir: string;
}

export class ContextAssembler {
  constructor(private readonly deps: AssemblerDeps) {}

  assemble(task: string): string {
    const sections: string[] = [];

    sections.push(`## Identity\n${this.deps.identity.toPromptText()}`);
    sections.push(`## User\n${this.deps.userModel.toPromptText()}`);
    sections.push(`## Knowledge\n${this.deps.semantic.toPromptText(task, 15)}`);
    sections.push(`## Current State\n${this.deps.working.toPromptText()}`);

    // Discover and describe skills
    const skillsPrompt = this.discoverSkills();
    if (skillsPrompt) {
      sections.push(skillsPrompt);
    }

    sections.push(`## Communication Style
When you spawn agents or use tools to accomplish tasks:
- Tell the user what you're doing and why: "I'll look into that" / "Let me check..."
- When spawning an agent, briefly say what it will do
- Give updates as work progresses
- When done, summarize what was accomplished
- Be conversational and direct, not robotic
- Keep the user informed but don't over-explain`);

    sections.push(`## Creating New Skills
You can create new skills by creating a new directory under the skills/ folder.
Each skill needs:
1. A SKILL.md file describing what it does, how to use it, when to use it
2. A run.ts file that is a standalone CLI tool (run with: tsx skills/<name>/run.ts <args>)

The skill should be self-contained and documented. Other agents (or you in the future) should be able to understand and use it just by reading SKILL.md.

When the user asks you to do something that could be a reusable skill, consider creating one.`);

    return sections.join("\n\n");
  }

  private discoverSkills(): string | null {
    const skillsDir = path.join(this.deps.projectDir, "skills");
    if (!fs.existsSync(skillsDir)) return null;

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills: Array<{ name: string; description: string }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;

      const content = fs.readFileSync(skillMd, "utf-8");
      // Extract first paragraph after heading
      const lines = content.split("\n");
      let description = "";
      let foundHeading = false;
      for (const line of lines) {
        if (line.startsWith("# ")) { foundHeading = true; continue; }
        if (foundHeading && line.trim()) { description = line.trim(); break; }
      }

      skills.push({ name: entry.name, description });
    }

    if (skills.length === 0) return null;

    const lines = [
      "## Rue Skills",
      `You have ${skills.length} skill(s) available. Each skill is a CLI tool in the skills/ directory.`,
      "To use a skill, read its SKILL.md for instructions, then run its CLI tool via Bash.",
      "To list all skills: `node --import tsx/esm skills/list-skills/run.ts`\n",
    ];

    for (const skill of skills) {
      lines.push(`- **${skill.name}**: ${skill.description}`);
      lines.push(`  Usage: Read \`skills/${skill.name}/SKILL.md\` then run via Bash: \`node --import tsx/esm skills/${skill.name}/run.ts <command>\``);
    }

    return lines.join("\n");
  }
}
