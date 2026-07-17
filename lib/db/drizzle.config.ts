import { defineConfig } from "drizzle-kit";
import path from "path";
import dotenv from "dotenv";

// Load the repo-root .env regardless of the process's current working
// directory (pnpm runs package scripts with cwd set to the package dir).
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
