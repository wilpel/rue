#!/usr/bin/env tsx

/**
 * Skill Creator — spawns a background agent to create a new skill
 * with SKILL.md, run.ts, and metadata.json following Rue's conventions.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function loadConfig(): { port: number } {
  const configPath = path.join(os.homedir(), ".rue", "config.json");
  if (fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return { port: raw.port ?? 18800 };
  }
  return { port: 18800 };
}

// Load the skill creation guide
const guideFile = path.join(process.cwd(), "docs", "how-to-create-skills.md");
const guide = fs.existsSync(guideFile) ? fs.readFileSync(guideFile, "utf-8") : "";

// Load an example metadata.json
const exampleMeta = JSON.stringify({ name: "example", short: "One or two sentence description of what this skill does." });

// Load an example skill for reference
const exampleSkillDir = path.join(process.cwd(), "skills", "tasks");
let exampleRun = "";
let exampleSkillMd = "";
if (fs.existsSync(path.join(exampleSkillDir, "run.ts"))) {
  exampleRun = fs.readFileSync(path.join(exampleSkillDir, "run.ts"), "utf-8");
}
if (fs.existsSync(path.join(exampleSkillDir, "SKILL.md"))) {
  exampleSkillMd = fs.readFileSync(path.join(exampleSkillDir, "SKILL.md"), "utf-8");
}

if (command === "create") {
  const name = getArg("name");
  const description = getArg("description");

  if (!name || !description) {
    console.error("Usage: run.ts create --name <skill-name> --description \"Detailed description...\"");
    process.exit(1);
  }

  // Validate name
  if (!/^[a-z0-9-]+$/.test(name)) {
    console.error("Error: skill name must be lowercase alphanumeric with dashes only");
    process.exit(1);
  }

  // Check if skill already exists
  const skillDir = path.join(process.cwd(), "skills", name);
  if (fs.existsSync(skillDir)) {
    console.error(`Error: skill "${name}" already exists at ${skillDir}`);
    process.exit(1);
  }

  const config = loadConfig();

  // Build the task for the delegate agent
  const task = `You are an expert skill creator for Rue, an AI agent daemon. Create a complete, production-quality skill.

## Skill to Create

**Name:** ${name}
**Description:** ${description}

## CRITICAL RULES

1. **Build GENERAL-PURPOSE tools.** If asked for "a skill to query a database", build a full database skill with connect, query, list-tables, describe-table, etc. — not just one query. Think about all the operations someone would need.

2. **Follow the exact structure.** Every skill needs:
   - \`skills/${name}/run.ts\` — The CLI tool (standalone TypeScript, no src/ imports)
   - \`skills/${name}/SKILL.md\` — Documentation with Usage, When to use, examples
   - \`skills/${name}/metadata.json\` — \`${exampleMeta}\`

3. **Self-contained.** Skills must NOT import from Rue's src/. Use the daemon HTTP API (http://127.0.0.1:{port}/api/...) for data access, or Node.js built-ins.

4. **Data in ~/.rue/.** Store persistent data at \`path.join(os.homedir(), ".rue", "${name}")\`.

5. **CLI interface.** All interaction through process.argv. Use the getArg() pattern.

6. **Use the daemon API for shared data.** If the skill needs to read/write shared state (tasks, messages, etc), call the daemon's REST API at http://127.0.0.1:<port>/api/... — check the config for the port. Available endpoints:
   - POST /api/db/exec — run SQL on the main database
   - POST /api/db/query — query the main database
   - GET/POST /api/tasks — task management
   - GET /api/history — message history

## Skill Creation Guide

${guide}

## Example: tasks skill

### SKILL.md:
\`\`\`markdown
${exampleSkillMd}
\`\`\`

### run.ts (abbreviated):
\`\`\`typescript
${exampleRun.slice(0, 3000)}
\`\`\`

## Your Job

1. Create the directory: \`skills/${name}/\`
2. Write \`skills/${name}/run.ts\` — complete, working CLI tool
3. Write \`skills/${name}/SKILL.md\` — clear documentation
4. Write \`skills/${name}/metadata.json\` — short description
5. Test it: run the script with --help and verify it prints usage

Think carefully about what commands this skill needs. Make it comprehensive and reusable. The skill should cover the full domain, not just the specific example in the description.`;

  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/api/delegate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task,
        name: `Skill creator: ${name}`,
      }),
    });

    const data = await res.json() as Record<string, unknown>;
    if (data.ok) {
      console.log(`Creating skill: ${name}`);
      console.log(`Agent spawned — it will create skills/${name}/ with run.ts, SKILL.md, and metadata.json`);
      console.log(`The skill will be available immediately once created.`);
    } else {
      console.error(`Failed: ${data.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Failed to reach daemon: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
} else {
  console.log("Usage: run.ts create --name <skill-name> --description \"Detailed description...\"");
  console.log("");
  console.log("Examples:");
  console.log('  create --name "weather" --description "Get weather forecasts and current conditions for any location"');
  console.log('  create --name "docker" --description "Manage Docker containers, images, and compose stacks"');
  console.log('  create --name "sql" --description "Connect to and query SQL databases (SQLite, PostgreSQL, MySQL)"');
}
