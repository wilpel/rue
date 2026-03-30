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
  private systemPromptCache: string | null = null;
  private personalityCache: string | null = null;
  private skillsCache: string | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 300_000; // 5 minutes

  constructor(private readonly deps: AssemblerDeps) {}

  /** Clear all caches so the next call to assemble() re-reads from disk. */
  reload(): void {
    this.systemPromptCache = null;
    this.personalityCache = null;
    this.skillsCache = null;
  }

  assemble(task: string): string {
    // Refresh cache every 5 minutes
    if (Date.now() - this.cacheTime > this.CACHE_TTL) {
      this.systemPromptCache = null;
      this.personalityCache = null;
      this.skillsCache = null;
      this.cacheTime = Date.now();
    }

    const sections: string[] = [];

    // Load prompts/SYSTEM.md — the primary system guide (cached after first read)
    if (this.systemPromptCache === null) {
      this.systemPromptCache = this.readProjectFile("prompts/SYSTEM.md") ?? "";
    }
    if (this.systemPromptCache) {
      sections.push(this.systemPromptCache);
    }

    // Load prompts/PERSONALITY.md (cached after first read)
    if (this.personalityCache === null) {
      this.personalityCache = this.readProjectFile("prompts/PERSONALITY.md") ?? "";
    }
    if (this.personalityCache) {
      sections.push(this.personalityCache);
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

    // Long-term memory (MEMORY.md)
    const memoryMd = this.loadMemoryMd();
    if (memoryMd) {
      sections.push(`## Long-term Memory\n${memoryMd}`);
    }

    // Today's + yesterday's daily notes
    const dailyNotes = this.loadDailyNotes();
    if (dailyNotes) {
      sections.push(`## Recent Notes\n${dailyNotes}`);
    }

    // Relevant knowledge from semantic memory
    const semanticText = this.deps.semantic.toPromptText(task, 15);
    if (semanticText && !semanticText.startsWith("No relevant")) {
      sections.push(`## Knowledge\n${semanticText}`);
    }

    // Knowledge base — load relevant pages from ~/.rue/kb/
    const kbContext = this.loadKnowledgeBase(task);
    if (kbContext) {
      sections.push(`## Knowledge Base\n${kbContext}`);
    }

    // Current working state
    const workingText = this.deps.working.toPromptText();
    if (workingText && !workingText.startsWith("No active")) {
      sections.push(`## Current State\n${workingText}`);
    }

    // Discover skills and append summary (cached after first read)
    if (this.skillsCache === null) {
      this.skillsCache = this.discoverSkills() ?? "";
    }
    if (this.skillsCache) {
      sections.push(this.skillsCache);
    }

    // Show running project agents
    const agentStatus = this.getRunningAgents();
    if (agentStatus) {
      sections.push(agentStatus);
    }

    return sections.join("\n\n");
  }

  private loadMemoryMd(): string | null {
    const memPath = path.join(os.homedir(), ".rue", "memory", "MEMORY.md");
    if (!fs.existsSync(memPath)) return null;
    const content = fs.readFileSync(memPath, "utf-8").trim();
    // Only include if it has actual content beyond the header
    const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("#"));
    if (lines.length === 0) return null;
    return content;
  }

  private loadDailyNotes(): string | null {
    const dailyDir = path.join(os.homedir(), ".rue", "memory", "daily");
    if (!fs.existsSync(dailyDir)) return null;

    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    const notes: string[] = [];
    for (const date of [yesterday, today]) {
      const file = path.join(dailyDir, `${date}.md`);
      if (fs.existsSync(file)) {
        notes.push(fs.readFileSync(file, "utf-8").trim());
      }
    }

    return notes.length > 0 ? notes.join("\n\n") : null;
  }

  /**
   * Load knowledge base pages into context.
   * All pages are loaded — the KB is the agent's long-term brain.
   * Capped at a token budget to avoid bloating the prompt.
   */
  private loadKnowledgeBase(_task: string): string | null {
    const kbDir = path.join(os.homedir(), ".rue", "kb");
    if (!fs.existsSync(kbDir)) return null;

    const pages: string[] = [];
    let totalLen = 0;
    const MAX_LEN = 6000;

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name));
        } else if (entry.name.endsWith(".md")) {
          const relPath = path.relative(kbDir, path.join(dir, entry.name)).replace(/\.md$/, "");
          const content = fs.readFileSync(path.join(dir, entry.name), "utf-8");
          const body = content.replace(/^---[\s\S]*?---\n?/, "").trim();
          if (body && totalLen + body.length < MAX_LEN) {
            pages.push(`### ${relPath}\n${body}`);
            totalLen += body.length;
          }
        }
      }
    };
    walk(kbDir);

    if (pages.length === 0) return null;

    let result = pages.join("\n\n");
    if (totalLen >= MAX_LEN) {
      result += "\n\n...(more pages available via `kb search`)";
    }

    return `${pages.length} page(s) loaded:\n\n${result}`;
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

    const running: Array<{ project: string; task: string }> = [];
    const projDirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const projDir of projDirs) {
      const tasksDir = path.join(projectsDir, projDir.name, "tasks");
      if (!fs.existsSync(tasksDir)) continue;
      for (const file of fs.readdirSync(tasksDir).filter(f => f.endsWith(".md"))) {
        const content = fs.readFileSync(path.join(tasksDir, file), "utf-8");
        if (!content.includes("status: in-progress")) continue;
        const titleMatch = content.match(/^#\s+(.+)$/m);
        running.push({ project: projDir.name, task: titleMatch?.[1] ?? file });
      }
    }

    if (running.length === 0) return null;
    const lines = ["## Running Project Agents", `${running.length} agent(s) working:\n`];
    for (const r of running) lines.push(`- **${r.project}**: ${r.task}`);
    return lines.join("\n");
  }
}
