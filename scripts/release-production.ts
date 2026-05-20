/**
 * One-command production release pipeline.
 * npm run release:production
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectReleaseChecksums } from "./generate-release-checksums.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = path.join(ROOT, "release");

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function quarantineLockedUnpacked(): void {
  const unpacked = path.join(RELEASE_DIR, "win-unpacked");
  if (!fs.existsSync(unpacked)) return;
  const stale = path.join(RELEASE_DIR, `win-unpacked.stale-${Date.now()}`);
  try {
    fs.renameSync(unpacked, stale);
    console.log(`[release:production] Quarantined locked win-unpacked → ${path.basename(stale)}`);
  } catch {
    try {
      fs.rmSync(unpacked, { recursive: true, force: true, maxRetries: 5, retryDelay: 800 });
    } catch (error) {
      console.warn(
        `[release:production] Could not remove win-unpacked (${error instanceof Error ? error.message : error}).`,
      );
    }
  }
}

function run(cmd: string, args: string[], label: string, env?: NodeJS.ProcessEnv): void {
  console.log(`\n[release:production] ▶ ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: env ? { ...process.env, ...env } : process.env,
  });
  if (r.status !== 0) {
    throw new Error(`${label} failed (exit ${r.status ?? "?"}).`);
  }
}

function gitValue(args: string[]): string {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return (r.stdout ?? "").trim();
}

function findLatestStagingDir(): string | null {
  if (!fs.existsSync(RELEASE_DIR)) return null;
  const dirs = fs
    .readdirSync(RELEASE_DIR)
    .filter((n) => n.startsWith("build-"))
    .map((n) => path.join(RELEASE_DIR, n))
    .filter((p) => fs.existsSync(path.join(p, "win-unpacked", "SAMY SOFT.exe")))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs[0] ?? null;
}

function writeFreezeAndBundle(version: string, stagingOut: string): void {
  const bundleDir = path.join(RELEASE_DIR, `bundle-v${version}`);
  const checksums = collectReleaseChecksums();
  const schemaManifest = readJson<{
    schemaPrismaSha256: string;
    bootstrapSqlSha256: string;
  }>(path.join(ROOT, "prisma", "schema-checksums.json"));
  const probe = readJson<Record<string, unknown>>(
    path.join(ROOT, ".data", "packaged-validation-probe.json"),
  );
  const commit = gitValue(["rev-parse", "HEAD"]);
  const nodeVersion = process.version;
  const electronVersion = spawnSync("npx", ["electron", "--version"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
  }).stdout?.trim();

  const nsis = checksums.find(
    (e) => e.relativePath.endsWith(".exe") && e.file.includes("Setup"),
  );
  const portable = checksums.find((e) => e.file === `SAMY SOFT ${version}.exe`);

  fs.mkdirSync(bundleDir, { recursive: true });

  const copyNames = [
    `SAMY SOFT Setup ${version}.exe`,
    `SAMY SOFT ${version}.exe`,
    `SAMY SOFT Setup ${version}.exe.blockmap`,
    "RELEASE_CHECKSUMS.sha256",
    "RELEASE_CHECKSUMS.json",
  ];
  for (const name of copyNames) {
    const src = path.join(RELEASE_DIR, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(bundleDir, name));
    }
  }
  if (fs.existsSync(path.join(ROOT, ".data", "packaged-validation-probe.json"))) {
    fs.copyFileSync(
      path.join(ROOT, ".data", "packaged-validation-probe.json"),
      path.join(bundleDir, "packaged-validation-probe.json"),
    );
  }

  const releaseManifest = {
    product: "SAMY SOFT",
    version,
    commit,
    builtAt: new Date().toISOString(),
    nodeVersion,
    electronVersion,
    stagingDirectory: path.basename(stagingOut),
    schemaPrismaSha256: schemaManifest?.schemaPrismaSha256 ?? null,
    bootstrapSqlSha256: schemaManifest?.bootstrapSqlSha256 ?? null,
    backupArchiveFormat: "ZIP_V1",
    backupManifestSchemaVersion: 2,
    installers: checksums.filter((e) => e.file.endsWith(".exe") && !e.relativePath.includes("win-unpacked")),
    packagedValidation: probe,
  };

  fs.writeFileSync(
    path.join(bundleDir, "RELEASE_MANIFEST.json"),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(RELEASE_DIR, "RELEASE_MANIFEST.json"),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
    "utf8",
  );

  const freezePath = path.join(ROOT, `RELEASE_FREEZE_v${version}.md`);
  const exeRows = checksums
    .filter((e) => e.file.endsWith(".exe") && !e.relativePath.includes("win-unpacked"))
    .map((e) => `| ${e.relativePath} | \`${e.sha256}\` | ${Math.round(e.bytes / 1024 / 1024)} MB |`)
    .join("\n");

  fs.writeFileSync(
    freezePath,
    `# SAMY SOFT — Release Freeze v${version}

**Frozen at:** ${releaseManifest.builtAt}  
**Status:** Production release freeze (generated by \`npm run release:production\`)

---

## Identity

| Field | Value |
|-------|-------|
| **Git commit** | \`${commit}\` |
| **App version** | ${version} |
| **Node.js** | ${nodeVersion} |
| **Electron** | ${electronVersion ?? "unknown"} |
| **Prisma schema SHA-256** | \`${schemaManifest?.schemaPrismaSha256 ?? "unknown"}\` |
| **Bootstrap SQL SHA-256** | \`${schemaManifest?.bootstrapSqlSha256 ?? "unknown"}\` |
| **Backup archive format** | ZIP_V1 |
| **Backup manifest schema** | v2 |

---

## Build commands

\`\`\`powershell
cd D:\\Samy-soft
git checkout ${commit}
npm ci
npm run release:production
\`\`\`

---

## Installer checksums (SHA-256)

| Artifact | SHA-256 | Size |
|----------|---------|------|
${exeRows}

Full list: \`release/RELEASE_CHECKSUMS.sha256\`

---

## Required environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| \`DATABASE_URL\` | Set by app | Prisma SQLite file URL |
| \`SAMY_RELEASE_CHANNEL\` | Optional | \`production\` / \`beta\` / \`dev\` |
| \`SAMY_E2E\` | Dev only | E2E harness (ignored when packaged) |
| \`SAMY_E2E_DATABASE_PATH\` | E2E only | Isolated test DB |
| \`SAMY_PACKAGED_EXE\` | validate:packaged | Override packaged EXE path |

---

## Release bundle

\`release/bundle-v${version}/\` — installers, checksums, \`RELEASE_MANIFEST.json\`, validation probe.

**Staging build:** \`${path.basename(stagingOut)}\`

---

## Rollback

See \`ROLLBACK_PROCEDURE_v${version}.md\`.

---

*Auto-generated — re-run \`npm run release:production\` to refresh.*
`,
    "utf8",
  );

  console.log(`\n[release:production] ✅ Complete`);
  console.log(`  Freeze doc: ${freezePath}`);
  console.log(`  Bundle:     ${bundleDir}`);
  console.log(`  NSIS SHA:   ${nsis?.sha256 ?? "n/a"}`);
  console.log(`  Portable:   ${portable?.sha256 ?? "n/a"}`);

  if (probe && Array.isArray((probe as { errors?: string[] }).errors) && (probe as { errors: string[] }).errors.length > 0) {
    console.warn("[release:production] Packaged probe reported errors — review probe JSON.");
    process.exit(1);
  }
}

function buildAndPackage(version: string): { stagingOut: string; stagedExe: string } {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/IM", "SAMY SOFT.exe", "/F"], { stdio: "ignore", shell: true });
    spawnSync("taskkill", ["/IM", "electron.exe", "/F"], { stdio: "ignore", shell: true });
  }
  quarantineLockedUnpacked();

  const clean = spawnSync("npm", ["run", "clean:installers"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (clean.status !== 0) {
    console.warn("[release:production] WARN clean:installers failed — continuing.");
  }

  run("npm", ["run", "verify:schema-checksum"], "Verify Prisma schema checksums");
  run("npm", ["run", "icons:generate"], "Generate icons");
  run("npm", ["run", "icons:verify"], "Verify icons");
  run("npm", ["run", "build"], "Build renderer + electron");

  const stagingOut = path.join(RELEASE_DIR, `build-${Date.now()}`);
  run(
    "npx",
    ["electron-builder", "--win", `--config.directories.output=${stagingOut.replace(/\\/g, "/")}`],
    "Package Windows installer (isolated output dir)",
  );

  for (const name of fs.readdirSync(stagingOut)) {
    if (name.endsWith(".exe") || name.endsWith(".blockmap") || name.endsWith(".yml")) {
      fs.copyFileSync(path.join(stagingOut, name), path.join(RELEASE_DIR, name));
    }
  }

  const stagedExe = path.join(stagingOut, "win-unpacked", "SAMY SOFT.exe");
  if (!fs.existsSync(stagedExe)) {
    throw new Error(`Packaged EXE missing: ${stagedExe}`);
  }

  const releaseUnpacked = path.join(RELEASE_DIR, "win-unpacked");
  if (!fs.existsSync(releaseUnpacked)) {
    try {
      fs.cpSync(path.join(stagingOut, "win-unpacked"), releaseUnpacked, { recursive: true });
    } catch {
      console.warn("[release:production] Using staging EXE for validation (win-unpacked locked).");
    }
  }

  return { stagingOut, stagedExe };
}

function main(): void {
  const pkg = readJson<{ version: string }>(path.join(ROOT, "package.json"));
  const version = pkg?.version ?? "0.0.0";

  console.log(`[release:production] SAMY SOFT v${version}`);

  let stagingOut: string;
  let stagedExe: string;

  if (process.env.SAMY_RELEASE_FINALIZE_ONLY === "1") {
    const latest = findLatestStagingDir();
    if (!latest) throw new Error("No staging build-* directory found.");
    stagingOut = latest;
    stagedExe = path.join(stagingOut, "win-unpacked", "SAMY SOFT.exe");
  } else {
    const built = buildAndPackage(version);
    stagingOut = built.stagingOut;
    stagedExe = built.stagedExe;
    run("npm", ["run", "release:checksums"], "Generate installer SHA-256");
    run("npm", ["run", "validate:packaged"], "Packaged validation probe", {
      SAMY_PACKAGED_EXE: stagedExe,
    });
  }

  writeFreezeAndBundle(version, stagingOut);
}

main();
