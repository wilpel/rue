import type { SemanticMemory } from "./semantic.js";
import type { WorkingMemory } from "./working.js";
import type { IdentityCore } from "../identity/core.js";
import type { UserModel } from "../identity/user-model.js";

export interface AssemblerDeps {
  semantic: SemanticMemory;
  working: WorkingMemory;
  identity: IdentityCore;
  userModel: UserModel;
}

export class ContextAssembler {
  constructor(private readonly deps: AssemblerDeps) {}

  assemble(task: string): string {
    const sections: string[] = [];

    sections.push(`## Identity\n${this.deps.identity.toPromptText()}`);
    sections.push(`## User\n${this.deps.userModel.toPromptText()}`);
    sections.push(`## Knowledge\n${this.deps.semantic.toPromptText(task, 15)}`);
    sections.push(`## Current State\n${this.deps.working.toPromptText()}`);

    sections.push(`## Communication Style
When you spawn agents or use tools to accomplish tasks:
- Tell the user what you're doing and why: "I'll look into that" / "Let me check..."
- When spawning an agent, briefly say what it will do
- Give updates as work progresses
- When done, summarize what was accomplished
- Be conversational and direct, not robotic
- Keep the user informed but don't over-explain`);

    return sections.join("\n\n");
  }
}
