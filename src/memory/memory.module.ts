import { Module } from "@nestjs/common";
import { MessageRepository } from "./message.repository.js";
import { SemanticRepository } from "./semantic.repository.js";
import { WorkspaceService } from "./workspace.service.js";
import { WorkspaceIntegrationService } from "./workspace-integration.service.js";
import { ActivationService } from "./activation.service.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";
import { AssemblerService } from "./assembler.service.js";
import { SessionService } from "./session.service.js";
import { SupabaseService } from "../database/supabase.service.js";
import { IdentityService } from "../identity/identity.service.js";
import { UserModelService } from "../identity/user-model.service.js";
import { IdentityModule } from "../identity/identity.module.js";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

@Module({
  imports: [IdentityModule],
  providers: [
    MessageRepository,
    ActivationService,
    SemanticRepository,
    WorkspaceService,
    WorkspaceIntegrationService,
    SessionService,
    { provide: KnowledgeBaseService, useFactory: (db: SupabaseService, activation: ActivationService) => new KnowledgeBaseService(db, activation), inject: [SupabaseService, ActivationService] },
    { provide: AssemblerService, useFactory: (semantic: SemanticRepository, workspace: WorkspaceService, identity: IdentityService, userModel: UserModelService, kb: KnowledgeBaseService) => new AssemblerService(semantic, workspace, identity, userModel, kb, PROJECT_ROOT), inject: [SemanticRepository, WorkspaceService, IdentityService, UserModelService, KnowledgeBaseService] },
  ],
  exports: [MessageRepository, SemanticRepository, WorkspaceService, ActivationService, KnowledgeBaseService, AssemblerService, SessionService],
})
export class MemoryModule {}
