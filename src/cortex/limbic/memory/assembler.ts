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
    return sections.join("\n\n");
  }
}
