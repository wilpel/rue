import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import { Test } from "@nestjs/testing";
import { WsAdapter } from "@nestjs/platform-ws";
import { AppModule } from "../src/app.module.js";
import { ConfigService } from "../src/config/config.service.js";
import { BusService } from "../src/bus/bus.service.js";
import { DatabaseService } from "../src/database/database.service.js";
import { InboxService } from "../src/inbox/inbox.service.js";
import { SupervisorService } from "../src/agents/supervisor.service.js";
import { DelegateService } from "../src/agents/delegate.service.js";
import { MessageRepository } from "../src/memory/message.repository.js";
import { AssemblerService } from "../src/memory/assembler.service.js";

// Write a temp config pointing to an empty dataDir so TelegramService finds no token
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rue-test-"));
const tmpConfigPath = path.join(tmpDir, "config.json");
fs.writeFileSync(tmpConfigPath, JSON.stringify({ dataDir: tmpDir }));

describe("AppModule", () => {
  let app: any;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("boots and resolves all core services", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(tmpConfigPath))
      .compile();
    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.init();

    expect(moduleRef.get(ConfigService)).toBeDefined();
    expect(moduleRef.get(BusService)).toBeDefined();
    expect(moduleRef.get(DatabaseService)).toBeDefined();
    expect(moduleRef.get(InboxService)).toBeDefined();
    expect(moduleRef.get(SupervisorService)).toBeDefined();
    expect(moduleRef.get(DelegateService)).toBeDefined();
    expect(moduleRef.get(MessageRepository)).toBeDefined();
    expect(moduleRef.get(AssemblerService)).toBeDefined();
  });
});
