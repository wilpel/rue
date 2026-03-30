import { Module } from "@nestjs/common";
import { IdentityService } from "./identity.service.js";
import { UserModelService } from "./user-model.service.js";
import { ConfigService } from "../config/config.service.js";
import * as path from "node:path";

@Module({
  providers: [
    { provide: IdentityService, useFactory: (config: ConfigService) => new IdentityService(path.join(config.dataDir, "identity")), inject: [ConfigService] },
    { provide: UserModelService, useFactory: (config: ConfigService) => new UserModelService(path.join(config.dataDir, "identity")), inject: [ConfigService] },
  ],
  exports: [IdentityService, UserModelService],
})
export class IdentityModule {}
