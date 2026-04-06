import { Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import { SemanticRepository } from "./semantic.repository.js";
import { WorkspaceService } from "./workspace.service.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";
import { IdentityService } from "../identity/identity.service.js";
import { UserModelService } from "../identity/user-model.service.js";

export type AssembleMode = "dispatcher" | "worker" | "followup";

@Injectable()
export class AssemblerService {
  private systemPromptCache: string | null = null;
  private personalityCache: string | null = null;
  private skillsCache: string | null = null;
  private cacheTime = 0;
  private cachedPromptPaths: string | null = null;
  private readonly CACHE_TTL = 300_000;
  private delegateService: { listDelegates(): Array<{ id: string; task: string; status: string; startedAt: number }> } | null = null;

  setDelegateService(svc: { listDelegates(): Array<{ id: string; task: string; status: string; startedAt: number }> }): void {
    this.delegateService = svc;
  }

  constructor(
    _semantic: SemanticRepository,
    private readonly workspace: WorkspaceService,
    private readonly identity: IdentityService,
    private readonly userModel: UserModelService,
    _kb: KnowledgeBaseService,
    private readonly projectDir: string,
  ) {}

  reload(): void { this.systemPromptCache = null; this.personalityCache = null; this.skillsCache = null; }

  async assemble(_task: string, promptPaths?: { systemPrompt?: string; personality?: string }, mode: AssembleMode = "dispatcher"): Promise<string> {
    if (Date.now() - this.cacheTime > this.CACHE_TTL) { this.systemPromptCache = null; this.personalityCache = null; this.skillsCache = null; this.cacheTime = Date.now(); }
    const pathKey = JSON.stringify(promptPaths);
    if (pathKey !== this.cachedPromptPaths) {
      this.systemPromptCache = null;
      this.personalityCache = null;
      this.cachedPromptPaths = pathKey;
    }
    // Section order matters for prompt caching: static content first, dynamic last.
    // SDK auto-caches the prefix — any change in early sections invalidates cache for everything after.
    // Order: system prompt (static) → personality (static) → skills (rare changes) → identity → delegates (every call)
    const sections: string[] = [];
    const systemPath = promptPaths?.systemPrompt ?? "prompts/SYSTEM.md";
    const personalityPath = promptPaths?.personality ?? "prompts/PERSONALITY.md";

    // System prompt: full for dispatcher/worker, first paragraph only for followup
    if (this.systemPromptCache === null) this.systemPromptCache = this.readProjectFile(systemPath) ?? "";
    if (this.systemPromptCache) {
      if (mode === "followup") {
        const firstPara = this.systemPromptCache.split("\n\n")[0];
        sections.push(firstPara);
      } else {
        sections.push(this.systemPromptCache);
      }
    }

    // Personality: brief (first 3 lines) for dispatcher, full for worker, none for followup
    if (mode !== "followup") {
      if (this.personalityCache === null) this.personalityCache = this.readProjectFile(personalityPath) ?? "";
      if (this.personalityCache) {
        if (mode === "dispatcher") {
          const brief = this.personalityCache.split("\n").slice(0, 3).join("\n");
          sections.push(brief);
        } else {
          sections.push(this.personalityCache);
        }
      }
    }

    // Skills index: dispatcher and worker only
    if (mode === "dispatcher" || mode === "worker") {
      if (this.skillsCache === null) this.skillsCache = this.discoverSkills() ?? "";
      if (this.skillsCache) sections.push(this.skillsCache);
    }

    // Workspace awareness: dispatcher and worker modes
    if (mode === "dispatcher" || mode === "worker") {
      const wsText = this.workspace.toPromptText();
      if (wsText) sections.push(`## Current Awareness\n${wsText}`);
    }

    // Workers get identity + user model for personalization
    if (mode === "worker") {
      const identityText = await this.identity.toPromptText();
      if (identityText) sections.push(`## Identity\n${identityText}`);
      const userText = await this.userModel.toPromptText();
      if (userText) sections.push(`## User\n${userText}`);
    }

    // Active delegates: dispatcher only
    if (mode === "dispatcher") {
      const delegates = this.delegateService?.listDelegates().filter(d => d.status === "running") ?? [];
      if (delegates.length > 0) {
        const lines = delegates.map(d => `- **${d.id}**: "${d.task}" (${d.status}, started ${Math.round((Date.now() - d.startedAt) / 1000)}s ago)`);
        sections.push(`## Active Delegates\nThese agents are currently working. Do NOT re-delegate work that is already in progress.\n\n${lines.join("\n")}`);
      }
    }

    return sections.join("\n\n");
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
    const skills: Array<{ name: string; short: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(skillsDir, entry.name, "metadata.json");
      if (!fs.existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        skills.push({ name: meta.name ?? entry.name, short: meta.short ?? "" });
      } catch { continue; }
    }
    if (skills.length === 0) return null;
    const lines = ["## Skills"];
    for (const skill of skills) {
      lines.push(`- **${skill.name}**: ${skill.short}`);
    }
    lines.push("\nRun: `node --import tsx/esm skills/<name>/run.ts --help` for usage. Read SKILL.md for full docs.");
    return lines.join("\n");
  }
}
