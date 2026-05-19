#!/usr/bin/env node
/**
 * Safe local cleanup for SAMY SOFT — removes regenerable build/cache artifacts only.
 * Usage: node scripts/clean-project.mjs [cache|build|installers|all] [--dry-run]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUARANTINE = path.join(ROOT, "_quarantine");

const CACHE_TARGETS = [
  ".vite",
  ".turbo",
  ".eslintcache",
  "node_modules/.cache",
  "coverage",
  ".nyc_output",
  "test-results",
  "playwright-report",
  "blob-report",
  "e2e/artifacts",
  "diagnostic-bundles",
  "logs",
  "tmp",
  "temp",
];

const BUILD_TARGETS = ["dist", "dist-electron", "out", "build"];

/** electron-builder default output — regenerable via `npm run dist:win`. */
const INSTALLER_TARGETS = ["release"];

/** Dated one-off installer folders at repo root (pattern). */
const INSTALLER_GLOB_PREFIX = "release-";

const LOG_GLOBS = [".log"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const mode = args.find((a) => !a.startsWith("-")) ?? "all";

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function dirSizeBytes(dir) {
  let total = 0;
  async function walk(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        try {
          const st = await fs.stat(full);
          total += st.size;
        } catch {
          /* skip */
        }
      }
    }
  }
  await walk(dir);
  return total;
}

async function removeTarget(relPath, report) {
  const abs = path.join(ROOT, relPath);
  if (!(await exists(abs))) return;

  let bytes = 0;
  const st = await fs.stat(abs);
  if (st.isDirectory()) {
    bytes = await dirSizeBytes(abs);
  } else {
    bytes = st.size;
  }

  if (dryRun) {
    report.skipped.push({ path: relPath, reason: "dry-run", bytes });
    return;
  }

  await fs.rm(abs, { recursive: true, force: true });
  report.deleted.push({ path: relPath, bytes });
}

async function quarantineTarget(relPath, report) {
  const abs = path.join(ROOT, relPath);
  if (!(await exists(abs))) return;

  const bytes = await dirSizeBytes(abs);
  const dest = path.join(QUARANTINE, relPath);

  if (dryRun) {
    report.quarantined.push({ path: relPath, dest: path.relative(ROOT, dest), bytes, dryRun: true });
    return;
  }

  await fs.mkdir(QUARANTINE, { recursive: true });
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.rename(abs, dest);
  } catch {
    await fs.cp(abs, dest, { recursive: true });
    await fs.rm(abs, { recursive: true, force: true });
  }
  report.quarantined.push({ path: relPath, dest: path.relative(ROOT, dest), bytes });
}

async function removeRootLogs(report) {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".log")) continue;
    await removeTarget(entry.name, report);
  }
}

async function findDatedReleaseFolders() {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith(INSTALLER_GLOB_PREFIX) && e.name !== "release")
    .map((e) => e.name);
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const report = {
    mode,
    dryRun,
    deleted: [],
    quarantined: [],
    skipped: [],
    protected: [
      "src/",
      "electron/",
      "prisma/schema.prisma",
      "prisma/migrations/",
      ".data/ (active SQLite)",
      ".env",
      "docs/",
      "shared/",
      "node_modules/ (except .cache)",
    ],
  };

  const runCache = mode === "cache" || mode === "all";
  const runBuild = mode === "build" || mode === "all";
  const runInstallers = mode === "installers" || mode === "all";

  if (runCache) {
    for (const target of CACHE_TARGETS) {
      await removeTarget(target, report);
    }
    await removeRootLogs(report);
  }

  if (runBuild) {
    for (const target of BUILD_TARGETS) {
      await removeTarget(target, report);
    }
  }

  if (runInstallers) {
    for (const target of INSTALLER_TARGETS) {
      await removeTarget(target, report);
    }
    const dated = await findDatedReleaseFolders();
    for (const folder of dated) {
      await quarantineTarget(folder, report);
    }
  }

  const freed =
    report.deleted.reduce((s, x) => s + x.bytes, 0) +
    report.quarantined.reduce((s, x) => s + x.bytes, 0);

  console.log(JSON.stringify({ ...report, freedBytes: freed, freedHuman: formatMb(freed) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
