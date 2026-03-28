import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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

    // Load prompts/SYSTEM.md — the primary system guide
    const systemMd = this.readProjectFile("prompts/SYSTEM.md");
    if (systemMd) {
      sections.push(systemMd);
    }

    // Load prompts/PERSONALITY.md
    const personalityMd = this.readProjectFile("prompts/PERSONALITY.md");
    if (personalityMd) {
      sections.push(personalityMd);
    }

    // Dynamic identity (evolves over time)
    const identityText = this.deps.identity.toPromptText();
    if (identityText) {
      sections.push(`## Dynamic Identity\n${identityText}`);
    }

    // User model
    const userText = this.deps.userModel.toPromptText();
    if (userText) {
      sections.push(`## User\n${userText}`);
    }

    // Relevant knowledge from semantic memory
    const semanticText = this.deps.semantic.toPromptText(task, 15);
    if (semanticText && !semanticText.startsWith("No relevant")) {
      sections.push(`## Knowledge\n${semanticText}`);
    }

    // Current working state
    const workingText = this.deps.working.toPromptText();
    if (workingText && !workingText.startsWith("No active")) {
      sections.push(`## Current State\n${workingText}`);
    }

    // Discover skills and append summary
    const skillsSummary = this.discoverSkills();
    if (skillsSummary) {
      sections.push(skillsSummary);
    }

    // Show running project agents
    const agentStatus = this.getRunningAgents();
    if (agentStatus) {
      sections.push(agentStatus);
    }

    return sections.join("\n\n");
  }

  private readProjectFile(filename: string): string | null {
    const filePath = path.join(this.deps.projectDir, filename);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8").trim();
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
      "## Detected Skills",
      `Found ${skills.length} skill(s) in the skills/ directory:\n`,
    ];

    for (const skill of skills) {
      lines.push(`- **${skill.name}**: ${skill.description}`);
    }

    lines.push("\nTo use a skill, read its SKILL.md for exact usage, then run via Bash.");

    return lines.join("\n");
  }

  private getRunningAgents(): string | null {
    const projectsDir = path.join(os.homedir(), ".rue", "workspace", "projects");
    if (!fs.existsSync(projectsDir)) return null;

    const running: Array<{ project: string; task: string; started: string }> = [];

    const projDirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const projDir of projDirs) {
      const tasksDir = path.join(projectsDir, projDir.name, "tasks");
      if (!fs.existsSync(tasksDir)) continue;

      const files = fs.readdirSync(tasksDir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        const content = fs.readFileSync(path.join(tasksDir, file), "utf-8");
        if (!content.includes("status: in-progress")) continue;

        const titleMatch = content.match(/^#\s+(.+)$/m);
        const startedMatch = content.match(/started:\s*(\S+)/);
        running.push({
          project: projDir.name,
          task: titleMatch?.[1] ?? file,
          started: startedMatch?.[1] ?? "unknown",
        });
      }
    }

    if (running.length === 0) return null;

    const lines = [
      "## Running Project Agents",
      `${running.length} agent(s) currently working:\n`,
    ];

    for (const r of running) {
      lines.push(`- **${r.project}**: ${r.task} (started: ${r.started})`);
    }

    return lines.join("\n");
  }
}
