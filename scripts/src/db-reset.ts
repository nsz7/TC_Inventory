import "./env";
import { execFileSync } from "node:child_process";
import pg from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// On Windows, pnpm is installed as a pnpm.cmd shim; execFileSync resolves an
// executable by exact name (no PATHEXT lookup, unlike shell invocation), so
// the bare name "pnpm" is a plain ENOENT there. macOS/Linux have no such
// shim, so the unmodified name is correct on those platforms.
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runPnpm(args: string[]) {
  execFileSync(PNPM_COMMAND, args, { stdio: "inherit" });
}

/**
 * Development convenience only: drops and recreates the database named in
 * DATABASE_URL, pushes the schema, and reseeds — one command instead of the
 * drop/create/push/seed sequence this otherwise takes by hand. Refuses
 * anything that isn't localhost, since this is destructive by design.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set — see .env.example.");
  }

  const target = new URL(databaseUrl);
  if (!LOCAL_HOSTS.has(target.hostname)) {
    throw new Error(
      `Refusing to run db:reset against "${target.hostname}" — this only runs against localhost/127.0.0.1. ` +
        "It drops and recreates the database; that's not something to risk on a shared or remote instance.",
    );
  }

  const dbName = target.pathname.replace(/^\//, "");
  if (!SAFE_IDENTIFIER.test(dbName)) {
    throw new Error(`DATABASE_URL's database name ("${dbName}") doesn't look like a plain identifier — refusing to proceed.`);
  }

  // Connect to the server's default maintenance database instead of the
  // target: Postgres won't let a connection drop the database it's on.
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";

  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    console.log(`Dropping database "${dbName}" (if it exists)...`);
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`Creating database "${dbName}"...`);
    await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  console.log("Pushing schema...");
  runPnpm(["--filter", "@workspace/db", "run", "push-force"]);

  console.log("Seeding...");
  runPnpm(["--filter", "scripts", "run", "seed"]);

  console.log("Database reset and reseeded.");
}

main().catch((err) => {
  console.error("db:reset failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
