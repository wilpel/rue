#!/usr/bin/env tsx

/**
 * System Info skill — check CPU, memory, disk, uptime, and network on macOS/Linux.
 */

import * as os from "node:os";
import { execSync } from "node:child_process";

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 10_000 }).trim();
  } catch {
    return "(unavailable)";
  }
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(" ");
}

// ── Commands ───────────────────────────────────────────────────

function showCpu(): void {
  const cpus = os.cpus();
  const model = cpus.length > 0 ? cpus[0].model : "(unknown)";
  const cores = cpus.length;
  const loadAvg = os.loadavg().map((l) => l.toFixed(2));

  console.log("CPU");
  console.log(`  Model:          ${model}`);
  console.log(`  Cores:          ${cores}`);
  console.log(`  Load avg (1/5/15m): ${loadAvg.join(" / ")}`);
}

function showMemory(): void {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;

  console.log("Memory");
  console.log(`  Total:  ${formatBytes(total)}`);
  console.log(`  Used:   ${formatBytes(used)}`);
  console.log(`  Free:   ${formatBytes(free)}`);
}

function showDisk(): void {
  console.log("Disk");
  const output = exec("df -h 2>/dev/null");
  if (output === "(unavailable)") {
    console.log("  Could not retrieve disk information.");
    return;
  }
  for (const line of output.split("\n")) {
    console.log(`  ${line}`);
  }
}

function showUptime(): void {
  const uptimeSecs = os.uptime();
  console.log("Uptime");
  console.log(`  ${formatUptime(uptimeSecs)} (${uptimeSecs} seconds)`);
}

function showNetwork(): void {
  const interfaces = os.networkInterfaces();
  console.log("Network Interfaces");
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    const ips = addrs
      .filter((a) => !a.internal)
      .map((a) => `${a.address} (${a.family})`)
      .join(", ");
    if (ips) {
      console.log(`  ${name}: ${ips}`);
    }
  }
  // If nothing printed (only loopback), show loopback
  const hasExternal = Object.values(interfaces).some((addrs) =>
    addrs?.some((a) => !a.internal)
  );
  if (!hasExternal) {
    console.log("  (no external interfaces found)");
  }
}

function showAll(): void {
  const separator = "─".repeat(50);
  console.log(`System Info — ${os.hostname()} (${os.platform()} ${os.arch()})`);
  console.log(separator);
  showCpu();
  console.log(separator);
  showMemory();
  console.log(separator);
  showDisk();
  console.log(separator);
  showUptime();
  console.log(separator);
  showNetwork();
}

// ── CLI ────────────────────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case "cpu":
    showCpu();
    break;
  case "memory":
    showMemory();
    break;
  case "disk":
    showDisk();
    break;
  case "uptime":
    showUptime();
    break;
  case "network":
    showNetwork();
    break;
  case "all":
    showAll();
    break;
  default:
    console.log("system-info — Check system information on macOS and Linux");
    console.log();
    console.log("Commands:");
    console.log("  cpu      CPU model, core count, load averages");
    console.log("  memory   Total, used, and free RAM");
    console.log("  disk     Disk space usage");
    console.log("  uptime   System uptime");
    console.log("  network  Network interfaces with IP addresses");
    console.log("  all      Full system summary");
    console.log();
    console.log("Usage: node --import tsx/esm skills/system-info/run.ts <command>");
}
