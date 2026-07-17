import { defineConfig } from "drizzle-kit";
import path from "path";
import dotenv from "dotenv";

// Load the repo-root .env regardless of the process's current working
// directory (pnpm runs package scripts with cwd set to the package dir).
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// drizzle-kit resolves `schema` with a glob library that requires forward
// slashes as path separators. On Windows, path.join()/__dirname produce
// backslash-separated paths, which the glob silently fails to match against
// (returns zero results — "No schema files found" — even though the file
// exists), so normalize to POSIX-style separators here.
const schemaPath = path.join(__dirname, "./src/schema/index.ts").split(path.sep).join("/");

export default defineConfig({
  schema: schemaPath,
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
