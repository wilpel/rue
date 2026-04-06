import { Module } from "@nestjs/common";
import { IdentityService } from "./identity.service.js";
import { UserModelService } from "./user-model.service.js";
import { SupabaseService } from "../database/supabase.service.js";

@Module({
  providers: [
    { provide: IdentityService, useFactory: (db: SupabaseService) => new IdentityService(db), inject: [SupabaseService] },
    { provide: UserModelService, useFactory: (db: SupabaseService) => new UserModelService(db), inject: [SupabaseService] },
  ],
  exports: [IdentityService, UserModelService],
})
export class IdentityModule {}
