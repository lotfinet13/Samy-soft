/**
 * Validates deterministic schema fingerprints for release gates.
 * - prisma/schema.prisma SHA-256
 * - prisma/bootstrap-schema.sql SHA-256
 * - manifest written to prisma/schema-checksums.json (committed)
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = path.join(ROOT, "prisma", "schema.prisma");
const BOOTSTRAP = path.join(ROOT, "prisma", "bootstrap-schema.sql");
const MANIFEST = path.join(ROOT, "prisma", "schema-checksums.json");

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

const current = {
  generatedAt: new Date().toISOString(),
  schemaPrismaSha256: sha256File(SCHEMA),
  bootstrapSqlSha256: sha256File(BOOTSTRAP),
};

const writeMode = process.argv.includes("--write");

if (!fs.existsSync(MANIFEST)) {
  if (!writeMode) {
    console.error("[schema-checksum] Missing prisma/schema-checksums.json — run: npm run verify:schema-checksum -- --write");
    process.exit(1);
  }
  fs.writeFileSync(MANIFEST, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  console.log("[schema-checksum] Created manifest.");
  process.exit(0);
}

const expected = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as {
  schemaPrismaSha256: string;
  bootstrapSqlSha256: string;
};

let drift = false;
if (expected.schemaPrismaSha256 !== current.schemaPrismaSha256) {
  console.error("[schema-checksum] schema.prisma checksum mismatch");
  drift = true;
}
if (expected.bootstrapSqlSha256 !== current.bootstrapSqlSha256) {
  console.error("[schema-checksum] bootstrap-schema.sql checksum mismatch");
  drift = true;
}

if (drift && writeMode) {
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ ...expected, ...current }, null, 2)}\n`, "utf8");
  console.log("[schema-checksum] Manifest updated (--write).");
  process.exit(0);
}

if (drift) {
  console.error("[schema-checksum] DRIFT — regenerate bootstrap and commit manifest with --write after review.");
  process.exit(1);
}

console.log("[schema-checksum] OK");
