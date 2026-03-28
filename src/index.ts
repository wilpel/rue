#!/usr/bin/env node
import { createCLI } from "./interfaces/cli/commands.js";

const program = createCLI();
program.parse();
