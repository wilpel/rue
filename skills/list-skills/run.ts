#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";

const skillsDir = path.resolve(import.meta.dirname, "..");

const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

const skills: Array<{ name: string; description: string }> = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
  if (!fs.existsSync(skillMd)) continue;

  const content = fs.readFileSync(skillMd, "utf-8");
  // Extract first paragraph after the heading as description
  const lines = content.split("\n");
  let description = "";
  let foundHeading = false;
  for (const line of lines) {
    if (line.startsWith("# ")) {
      foundHeading = true;
      continue;
    }
    if (foundHeading && line.trim()) {
      description = line.trim();
      break;
    }
  }

  skills.push({ name: entry.name, description });
}

if (skills.length === 0) {
  console.log("No skills found.");
} else {
  console.log(`Found ${skills.length} skill(s):\n`);
  for (const skill of skills) {
    console.log(`  ${skill.name}`);
    console.log(`    ${skill.description}\n`);
  }
}
