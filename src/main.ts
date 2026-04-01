import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { WsAdapter } from "@nestjs/platform-ws";
import { AppModule } from "./app.module.js";
import { ConfigService } from "./config/config.service.js";
import { log } from "./shared/logger.js";

export async function bootstrapNest(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  const config = app.get(ConfigService);

  process.setMaxListeners(50);

  await app.listen(config.port, "127.0.0.1");
  log.info(`Rue daemon running on port ${config.port}`);

  const shutdown = async () => {
    log.info("Shutting down...");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return app;
}
