/**
 * Proves schema applies on a clean SQLite file via `db push` (same path as E2E / greenfield installs).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMP_DIR = path.join(ROOT, ".data", "ci-db-push-check");
const DB_PATH = path.join(TEMP_DIR, "fresh.sqlite");

function run(cmd: string, env?: NodeJS.ProcessEnv): void {
  execSync(cmd, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env }, shell: true });
}

fs.mkdirSync(TEMP_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

const databaseUrl = `file:${DB_PATH.replace(/\\/g, "/")}`;
console.log("[db-push-check] Fresh database:", databaseUrl);

run("npx prisma db push --skip-generate", { DATABASE_URL: databaseUrl });
run("npx prisma validate");
console.log("[db-push-check] OK — clean db push succeeded");
