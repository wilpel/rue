import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import { ConfigService } from "../config/config.service.js";

@Global()
@Module({
  providers: [
    {
      provide: DatabaseService,
      useFactory: (config: ConfigService) => new DatabaseService(config.dataDir),
      inject: [ConfigService],
    },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
