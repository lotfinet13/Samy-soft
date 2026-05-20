/**
 * SHA-256 checksums for release/installer artifacts.
 * Writes release/RELEASE_CHECKSUMS.sha256 and release/RELEASE_CHECKSUMS.json
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = path.join(ROOT, "release");

type ChecksumEntry = {
  file: string;
  relativePath: string;
  bytes: number;
  sha256: string;
};

function sha256File(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex").toUpperCase();
}

export function collectReleaseChecksums(dir = RELEASE_DIR): ChecksumEntry[] {
  if (!fs.existsSync(dir)) return [];
  const entries: ChecksumEntry[] = [];
  const walk = (base: string, rel = "") => {
    for (const name of fs.readdirSync(base)) {
      const full = path.join(base, name);
      const relPath = rel ? path.join(rel, name) : name;
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (name === "bundle-v0.2.0") continue;
        walk(full, relPath);
        continue;
      }
      if (!/\.(exe|blockmap|yml|yaml)$/i.test(name) && name !== "RELEASE_MANIFEST.json") {
        continue;
      }
      entries.push({
        file: name,
        relativePath: relPath.replace(/\\/g, "/"),
        bytes: st.size,
        sha256: sha256File(full),
      });
    }
  };
  walk(dir);
  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function main(): void {
  const entries = collectReleaseChecksums();
  if (entries.length === 0) {
    console.error("[release:checksums] No artifacts in release/ — run dist:win first.");
    process.exit(1);
  }

  const lines = entries.map((e) => `${e.sha256}  ${e.relativePath}`);
  const shaPath = path.join(RELEASE_DIR, "RELEASE_CHECKSUMS.sha256");
  const jsonPath = path.join(RELEASE_DIR, "RELEASE_CHECKSUMS.json");

  fs.writeFileSync(shaPath, `${lines.join("\n")}\n`, "utf8");
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2)}\n`,
    "utf8",
  );

  console.log(`[release:checksums] Wrote ${entries.length} entries →`);
  console.log(`  ${shaPath}`);
  console.log(`  ${jsonPath}`);
  for (const e of entries) {
    console.log(`  ${e.sha256.slice(0, 16)}…  ${e.relativePath} (${Math.round(e.bytes / 1024 / 1024)} MB)`);
  }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").includes("generate-release-checksums");
if (isDirectRun) {
  main();
}
