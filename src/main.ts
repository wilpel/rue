import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ConfigService } from "./config/config.service.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  process.setMaxListeners(50);

  await app.listen(config.port, "127.0.0.1");
  console.log(`Rue daemon running on port ${config.port}`);

  const shutdown = async () => {
    console.log("\nShutting down...");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap();
