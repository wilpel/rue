import { Command } from "commander";
import { DaemonClient } from "./client.js";
import { DaemonServer } from "../../daemon/server.js";
import { loadConfig } from "../../shared/config.js";
import * as path from "node:path";
import * as os from "node:os";

const CONFIG_PATH = path.join(os.homedir(), ".rue", "config.json");

export function createCLI(): Command {
  const program = new Command();
  program.name("rue").description("Rue Bot — your AI agent daemon").version("0.1.0");

  program
    .command("ask <text>")
    .description("Send a task to the daemon")
    .action(async (text: string) => {
      const config = loadConfig(CONFIG_PATH);
      const client = new DaemonClient(`ws://localhost:${config.port}`);
      try {
        await client.connect();
        const result = await client.ask(text, {
          onStream: (chunk) => process.stdout.write(chunk),
        });
        console.log("\n" + result.output);
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

  return program;
}
