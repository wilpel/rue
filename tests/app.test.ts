import { describe, it, expect, afterEach } from "vitest";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module.js";
import { ConfigService } from "../src/config/config.service.js";
import { BusService } from "../src/bus/bus.service.js";
import { DatabaseService } from "../src/database/database.service.js";

describe("AppModule", () => {
  let app: any;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("boots and resolves core services", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    expect(moduleRef.get(ConfigService)).toBeDefined();
    expect(moduleRef.get(BusService)).toBeDefined();
    expect(moduleRef.get(DatabaseService)).toBeDefined();
  });
});
