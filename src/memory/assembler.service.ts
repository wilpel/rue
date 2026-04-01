import { Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SemanticRepository } from "./semantic.repository.js";
import { WorkingMemoryService } from "./working-memory.service.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";
import { IdentityService } from "../identity/identity.service.js";
import { UserModelService } from "../identity/user-model.service.js";

@Injectable()
export class AssemblerService {
  private systemPromptCache: string | null = null;
  private personalityCache: string | null = null;
  private skillsCache: string | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 300_000;
  private delegateService: { listDelegates(): Array<{ id: string; task: string; status: string; startedAt: number }> } | null = null;

  setDelegateService(svc: { listDelegates(): Array<{ id: string; task: string; status: string; startedAt: number }> }): void {
    this.delegateService = svc;
  }

  constructor(
    private readonly semantic: SemanticRepository,
    private readonly working: WorkingMemoryService,
    private readonly identity: IdentityService,
    private readonly userModel: UserModelService,
    private readonly kb: KnowledgeBaseService,
    private readonly projectDir: string,
  ) {}

  reload(): void { this.systemPromptCache = null; this.personalityCache = null; this.skillsCache = null; }

  assemble(task: string): string {
    if (Date.now() - this.cacheTime > this.CACHE_TTL) { this.systemPromptCache = null; this.personalityCache = null; this.skillsCache = null; this.cacheTime = Date.now(); }
    const sections: string[] = [];
    if (this.systemPromptCache === null) this.systemPromptCache = this.readProjectFile("prompts/SYSTEM.md") ?? "";
    if (this.systemPromptCache) sections.push(this.systemPromptCache);
    if (this.personalityCache === null) this.personalityCache = this.readProjectFile("prompts/PERSONALITY.md") ?? "";
    if (this.personalityCache) sections.push(this.personalityCache);
    const identityText = this.identity.toPromptText();
    if (identityText) sections.push(`## Dynamic Identity\n${identityText}`);
    const userText = this.userModel.toPromptText();
    if (userText) sections.push(`## User\n${userText}`);
    const memoryMd = this.loadMemoryMd();
    if (memoryMd) sections.push(`## Long-term Memory\n${memoryMd}`);
    const dailyNotes = this.loadDailyNotes();
    if (dailyNotes) sections.push(`## Recent Notes\n${dailyNotes}`);
    const semanticText = this.semantic.toPromptText(task, 15);
    if (semanticText && !semanticText.startsWith("No relevant")) sections.push(`## Knowledge\n${semanticText}`);
    const kbContext = this.kb.toPromptText();
    if (kbContext) sections.push(`## Knowledge Base\n${kbContext}`);
    const workingText = this.working.toPromptText();
    if (workingText && !workingText.startsWith("No active")) sections.push(`## Current State\n${workingText}`);
    if (this.skillsCache === null) this.skillsCache = this.discoverSkills() ?? "";
    if (this.skillsCache) sections.push(this.skillsCache);
    const delegates = this.delegateService?.listDelegates().filter(d => d.status === "running") ?? [];
    if (delegates.length > 0) {
      const lines = delegates.map(d => `- **${d.id}**: "${d.task}" (${d.status}, started ${Math.round((Date.now() - d.startedAt) / 1000)}s ago)`);
      sections.push(`## Active Delegates\nThese agents are currently working. Do NOT re-delegate work that is already in progress.\n\n${lines.join("\n")}`);
    }
    return sections.join("\n\n");
  }

  private loadMemoryMd(): string | null {
    const memPath = path.join(os.homedir(), ".rue", "memory", "MEMORY.md");
    if (!fs.existsSync(memPath)) return null;
    const content = fs.readFileSync(memPath, "utf-8").trim();
    const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("#"));
    return lines.length === 0 ? null : content;
  }

  private loadDailyNotes(): string | null {
    const dailyDir = path.join(os.homedir(), ".rue", "memory", "daily");
    if (!fs.existsSync(dailyDir)) return null;
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const notes: string[] = [];
    for (const date of [yesterday, today]) {
      const file = path.join(dailyDir, `${date}.md`);
      if (fs.existsSync(file)) notes.push(fs.readFileSync(file, "utf-8").trim());
    }
    return notes.length > 0 ? notes.join("\n\n") : null;
  }

  private readProjectFile(filename: string): string | null {
    const filePath = path.join(this.projectDir, filename);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8").trim();
  }

  private discoverSkills(): string | null {
    const skillsDir = path.join(this.projectDir, "skills");
    if (!fs.existsSync(skillsDir)) return null;
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills: Array<{ name: string; description: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      const content = fs.readFileSync(skillMd, "utf-8");
      const lines = content.split("\n");
      let description = ""; let foundHeading = false;
      for (const line of lines) { if (line.startsWith("# ")) { foundHeading = true; continue; } if (foundHeading && line.trim()) { description = line.trim(); break; } }
      skills.push({ name: entry.name, description });
    }
    if (skills.length === 0) return null;
    const lines = ["## Detected Skills", `Found ${skills.length} skill(s) in the skills/ directory:\n`];
    for (const skill of skills) lines.push(`- **${skill.name}**: ${skill.description}`);
    lines.push("\nTo use a skill, read its SKILL.md for exact usage, then run via Bash.");
    return lines.join("\n");
  }
}
