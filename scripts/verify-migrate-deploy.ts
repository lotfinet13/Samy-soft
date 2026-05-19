/**
 * Proves `prisma migrate deploy` succeeds on a clean SQLite file (parity with fresh install).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMP_DIR = path.join(ROOT, ".data", "ci-migrate-check");
const DB_PATH = path.join(TEMP_DIR, "migrate-deploy.sqlite");

function run(cmd: string, env?: NodeJS.ProcessEnv): void {
  execSync(cmd, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env }, shell: true });
}

fs.mkdirSync(TEMP_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

const databaseUrl = `file:${DB_PATH.replace(/\\/g, "/")}`;
console.log("[migrate-deploy] Fresh database:", databaseUrl);

run("npx prisma migrate deploy", { DATABASE_URL: databaseUrl });
run("npx prisma migrate status", { DATABASE_URL: databaseUrl });
run("npx prisma validate");
console.log("[migrate-deploy] OK — clean deploy succeeded");
