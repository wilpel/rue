import { defineConfig } from "drizzle-kit";
import * as path from "node:path";
import * as os from "node:os";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: path.join(os.homedir(), ".rue", "rue.db"),
  },
});
