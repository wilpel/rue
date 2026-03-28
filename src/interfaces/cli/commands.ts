import { Command } from "commander";
import { DaemonClient } from "./client.js";
import { DaemonServer } from "../../daemon/server.js";
import { loadConfig } from "../../shared/config.js";
import { TelegramStore } from "../telegram/store.js";
import * as path from "node:path";
import * as os from "node:os";

const CONFIG_PATH = path.join(os.homedir(), ".rue", "config.json");

export function createCLI(): Command {
  const program = new Command();
  program.name("rue").description("Rue Bot — your AI agent daemon").version("0.1.0");

  // Default action: launch TUI when no subcommand given
  program
    .command("chat", { isDefault: true })
    .description("Open interactive chat TUI (default)")
    .action(async () => {
      const config = loadConfig(CONFIG_PATH);
      const { startTUI } = await import("./tui/index.js");
      await startTUI(`ws://localhost:${config.port}`);
    });

  program
    .command("ask <text>")
    .description("Send a task to the daemon")
    .action(async (text: string) => {
      const config = loadConfig(CONFIG_PATH);
      const client = new DaemonClient(`ws://localhost:${config.port}`);
      try {
        await client.connect();
        await client.ask(text, {
          onStream: (chunk) => process.stdout.write(chunk),
        });
        console.log(""); // newline after streamed output
        client.disconnect();
        process.exit(0);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  program
    .command("status")
    .description("Show active agents and queue status")
    .action(async () => {
      const config = loadConfig(CONFIG_PATH);
      const client = new DaemonClient(`ws://localhost:${config.port}`);
      try {
        await client.connect();
        const status = await client.status();
        console.log(JSON.stringify(status, null, 2));
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  program
    .command("agents")
    .description("List running agents")
    .action(async () => {
      const config = loadConfig(CONFIG_PATH);
      const client = new DaemonClient(`ws://localhost:${config.port}`);
      try {
        await client.connect();
        const result = await client.agents();
        if ((result.agents as unknown[]).length === 0) {
          console.log("No active agents.");
        } else {
          console.log(JSON.stringify(result.agents, null, 2));
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  program
    .command("steer <agentId> <message>")
    .description("Inject guidance into a running agent")
    .action(async (agentId: string, message: string) => {
      const config = loadConfig(CONFIG_PATH);
      const client = new DaemonClient(`ws://localhost:${config.port}`);
      try {
        await client.connect();
        client.steer(agentId, message);
        console.log(`Steered agent ${agentId}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  program
    .command("kill <agentId>")
    .description("Kill a running agent")
    .action(async (agentId: string) => {
      const config = loadConfig(CONFIG_PATH);
      const client = new DaemonClient(`ws://localhost:${config.port}`);
      try {
        await client.connect();
        client.kill(agentId);
        console.log(`Killed agent ${agentId}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  const daemon = program.command("daemon").description("Manage the daemon process");

  daemon
    .command("start")
    .description("Start the daemon")
    .option("-f, --foreground", "Run in foreground")
    .action(async () => {
      const config = loadConfig(CONFIG_PATH);
      const server = new DaemonServer({ port: config.port, dataDir: config.dataDir });
      console.log(`Starting Rue daemon on port ${config.port}...`);
      await server.start();
      console.log(`Daemon running. PID: ${process.pid}`);
      const shutdown = async () => {
        console.log("\nShutting down...");
        await server.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });

  daemon.command("stop").description("Stop the daemon").action(() => {
    console.log("Daemon stop — not yet implemented (use Ctrl+C in foreground mode)");
  });

  // ── Telegram commands ──────────────────────────────────────────

  const telegram = program.command("telegram").description("Manage Telegram bot integration");

  telegram
    .command("setup <botToken>")
    .description("Configure the Telegram bot token")
    .action((botToken: string) => {
      const config = loadConfig(CONFIG_PATH);
      const store = new TelegramStore(config.dataDir);
      store.setBotToken(botToken);
      console.log("Telegram bot token saved.");
      console.log("Restart the daemon to activate the bot.");
    });

  telegram
    .command("pair")
    .description("Generate a pairing code for Telegram")
    .action(() => {
      const config = loadConfig(CONFIG_PATH);
      const store = new TelegramStore(config.dataDir);

      if (!store.getBotToken()) {
        console.error("No bot token configured. Run: rue telegram setup <token>");
        process.exit(1);
      }

      const pairingCode = store.generatePairingCode();
      const expiresIn = Math.round((pairingCode.expiresAt - Date.now()) / 1000);
      console.log(`\nPairing code: ${pairingCode.code}`);
      console.log(`Expires in ${expiresIn} seconds.`);
      console.log(`\nSend this to your Telegram bot: /pair ${pairingCode.code}`);
    });

  telegram
    .command("users")
    .description("List paired Telegram users")
    .action(() => {
      const config = loadConfig(CONFIG_PATH);
      const store = new TelegramStore(config.dataDir);
      const users = store.getPairedUsers();

      if (users.length === 0) {
        console.log("No paired users.");
        return;
      }

      console.log("Paired users:\n");
      for (const user of users) {
        const name = user.telegramUsername ? `@${user.telegramUsername}` : `ID: ${user.telegramId}`;
        console.log(`  ${name} (paired ${user.pairedAt})`);
      }
    });

  telegram
    .command("remove <telegramId>")
    .description("Remove a paired Telegram user by their ID")
    .action((telegramId: string) => {
      const config = loadConfig(CONFIG_PATH);
      const store = new TelegramStore(config.dataDir);
      const id = parseInt(telegramId, 10);
      if (isNaN(id)) {
        console.error("Invalid Telegram ID.");
        process.exit(1);
      }
      if (store.removePairedUser(id)) {
        console.log(`Removed user ${telegramId}.`);
      } else {
        console.log(`User ${telegramId} not found.`);
      }
    });

  telegram
    .command("status")
    .description("Show Telegram bot configuration status")
    .action(() => {
      const config = loadConfig(CONFIG_PATH);
      const store = new TelegramStore(config.dataDir);
      const token = store.getBotToken();
      const users = store.getPairedUsers();

      console.log(`Bot token: ${token ? "configured" : "not set"}`);
      console.log(`Paired users: ${users.length}`);
      if (token) {
        console.log(`\nThe bot will start automatically with the daemon.`);
      }
    });

  return program;
}
