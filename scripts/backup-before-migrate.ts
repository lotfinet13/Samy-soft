/**
 * Developer safety: copy production/dev SQLite before `prisma migrate dev`.
 * Usage: npm run db:backup-before-migrate
 * Respects DATABASE_URL or SAMY_E2E_DATABASE_PATH.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveDbPath(): string {
  const fromEnv = process.env.DATABASE_URL ?? process.env.SAMY_E2E_DATABASE_PATH;
  if (fromEnv?.startsWith("file:")) {
    const rel = fromEnv.replace(/^file:/, "").replace(/^\//, "");
    return path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  }
  return path.join(ROOT, ".data", "samy-soft.sqlite");
}

const dbPath = resolveDbPath();
if (!existsSync(dbPath)) {
  console.error(`[backup-before-migrate] Database not found: ${dbPath}`);
  process.exit(1);
}

const backupDir = path.join(ROOT, ".data", "pre-migrate-backups");
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = path.join(backupDir, `${path.basename(dbPath)}.${stamp}.bak`);

copyFileSync(dbPath, dest);
console.log(`[backup-before-migrate] Copied to ${dest}`);
