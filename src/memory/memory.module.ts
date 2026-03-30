import { Module } from "@nestjs/common";
import { MessageRepository } from "./message.repository.js";
import { SemanticRepository } from "./semantic.repository.js";
import { WorkingMemoryService } from "./working-memory.service.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";
import { AssemblerService } from "./assembler.service.js";
import { ConfigService } from "../config/config.service.js";
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
    SemanticRepository,
    WorkingMemoryService,
    { provide: KnowledgeBaseService, useFactory: (config: ConfigService) => new KnowledgeBaseService(path.join(config.dataDir, "kb")), inject: [ConfigService] },
    { provide: AssemblerService, useFactory: (semantic: SemanticRepository, working: WorkingMemoryService, identity: IdentityService, userModel: UserModelService, kb: KnowledgeBaseService) => new AssemblerService(semantic, working, identity, userModel, kb, PROJECT_ROOT), inject: [SemanticRepository, WorkingMemoryService, IdentityService, UserModelService, KnowledgeBaseService] },
  ],
  exports: [MessageRepository, SemanticRepository, WorkingMemoryService, KnowledgeBaseService, AssemblerService],
})
export class MemoryModule {}
