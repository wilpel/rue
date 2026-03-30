import { Command } from "commander";
import { DaemonClient } from "./client.js";
import { DaemonServer } from "../../daemon/server.js";
import { loadConfig } from "../../shared/config.js";
import { TelegramStore } from "../telegram/store.js";
import * as fs from "node:fs";
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

  daemon.command("stop").description("Stop the daemon").action(async () => {
    try {
      const { execSync } = await import("node:child_process");
      const pids = execSync("lsof -i :18800 -t 2>/dev/null", { encoding: "utf-8" }).trim();
      if (!pids) {
        console.log("Daemon is not running.");
        return;
      }
      for (const pid of pids.split("\n")) {
        try { process.kill(parseInt(pid, 10), "SIGTERM"); } catch {}
      }
      console.log("Daemon stopped.");
    } catch {
      console.log("Daemon is not running.");
    }
  });

  daemon.command("restart").description("Restart the daemon").action(async () => {
    const { execSync, spawn: _spawn } = await import("node:child_process");
    // Stop
    try {
      const pids = execSync("lsof -i :18800 -t 2>/dev/null", { encoding: "utf-8" }).trim();
      if (pids) {
        for (const pid of pids.split("\n")) {
          try { process.kill(parseInt(pid, 10), "SIGTERM"); } catch {}
        }
        console.log("Stopped old daemon.");
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch {}
    // Start
    const config = loadConfig(CONFIG_PATH);
    const server = new DaemonServer({ port: config.port, dataDir: config.dataDir });
    console.log(`Starting Rue daemon on port ${config.port}...`);
    await server.start();
    console.log(`Daemon running. PID: ${process.pid}`);
    const shutdown = async () => { console.log("\nShutting down..."); await server.stop(); process.exit(0); };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
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

  // ── Secrets commands ──────────────────────────────────────────

  const secrets = program.command("secrets").description("Manage encrypted secrets vault");

  secrets
    .command("set <key> <value>")
    .description("Store a secret")
    .action(async (key: string, value: string) => {
      const { execSync } = await import("node:child_process");
      try {
        execSync(`node --import tsx/esm skills/secrets/run.ts set --key "${key}" --value "${value.replace(/"/g, '\\"')}"`, { cwd: path.resolve(__dirname, "..", "..", ".."), stdio: "inherit" });
      } catch { process.exit(1); }
    });

  secrets
    .command("get <key>")
    .description("Retrieve a secret")
    .action(async (key: string) => {
      const { execSync } = await import("node:child_process");
      try {
        execSync(`node --import tsx/esm skills/secrets/run.ts get --key "${key}"`, { cwd: path.resolve(__dirname, "..", "..", ".."), stdio: "inherit" });
      } catch { process.exit(1); }
    });

  secrets
    .command("list")
    .description("List all secret keys")
    .action(async () => {
      const { execSync } = await import("node:child_process");
      try {
        execSync("node --import tsx/esm skills/secrets/run.ts list", { cwd: path.resolve(__dirname, "..", "..", ".."), stdio: "inherit" });
      } catch { process.exit(1); }
    });

  secrets
    .command("delete <key>")
    .description("Delete a secret")
    .action(async (key: string) => {
      const { execSync } = await import("node:child_process");
      try {
        execSync(`node --import tsx/esm skills/secrets/run.ts delete --key "${key}"`, { cwd: path.resolve(__dirname, "..", "..", ".."), stdio: "inherit" });
      } catch { process.exit(1); }
    });

  program.command("info").description("Show daemon info").action(async () => {
    const config = loadConfig(CONFIG_PATH);
    console.log("Rue Bot v0.1.0");
    console.log(`Data dir: ${config.dataDir}`);
    console.log(`Port: ${config.port}`);
    try {
      const { execSync } = await import("node:child_process");
      const pids = execSync("lsof -i :18800 -t 2>/dev/null", { encoding: "utf-8" }).trim();
      console.log(`Daemon: ${pids ? "running (PID " + pids.split("\n")[0] + ")" : "stopped"}`);
    } catch {
      console.log("Daemon: stopped");
    }
  });

  // ── Skills commands ──────────────────────────────────────────

  const skills = program.command("skills").description("Manage skills");

  skills
    .command("validate [name]")
    .description("Validate a skill's structure")
    .action(async (name?: string) => {
      const skillsDir = path.join(path.resolve(__dirname, "..", "..", ".."), "skills");
      if (!fs.existsSync(skillsDir)) {
        console.error("No skills/ directory found.");
        process.exit(1);
      }
      const dirs = name
        ? [name]
        : fs.readdirSync(skillsDir).filter(d => fs.statSync(path.join(skillsDir, d)).isDirectory());

      let errors = 0;
      for (const dir of dirs) {
        const skillPath = path.join(skillsDir, dir);
        const hasSkillMd = fs.existsSync(path.join(skillPath, "SKILL.md"));
        const hasRunTs = fs.existsSync(path.join(skillPath, "run.ts"));

        if (!hasSkillMd) { console.log(`  ✗ ${dir}: missing SKILL.md`); errors++; }
        else if (!hasRunTs) { console.log(`  ✗ ${dir}: missing run.ts`); errors++; }
        else {
          const skillMd = fs.readFileSync(path.join(skillPath, "SKILL.md"), "utf-8");
          const hasUsage = skillMd.includes("## Usage");
          const hasWhenToUse = skillMd.includes("## When to use");
          if (!hasUsage || !hasWhenToUse) {
            console.log(`  ⚠ ${dir}: SKILL.md missing sections (Usage: ${hasUsage}, When to use: ${hasWhenToUse})`);
          } else {
            console.log(`  ✓ ${dir}`);
          }
        }
      }
      if (errors > 0) process.exit(1);
    });

  return program;
}
