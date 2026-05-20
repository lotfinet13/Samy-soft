import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function defaultRepoBootstrapSchemaPath(): string {
  return path.join(moduleDir, "..", "prisma", "bootstrap-schema.sql");
}

export function defaultRepoRoot(): string {
  return path.join(moduleDir, "..");
}

export type BootstrapSchemaDriftOptions = {
  bootstrapPath?: string;
  repoRoot?: string;
  /** Packaged runtime: file is shipped via extraResources; Prisma CLI is not available. */
  presenceOnly?: boolean;
};

export function detectBootstrapSchemaDrift(options: BootstrapSchemaDriftOptions = {}): {
  driftDetected: boolean;
  detail?: string;
  fileExists: boolean;
} {
  const bootstrapPath = options.bootstrapPath ?? defaultRepoBootstrapSchemaPath();
  const repoRoot = options.repoRoot ?? defaultRepoRoot();

  if (!fs.existsSync(bootstrapPath)) {
    return { driftDetected: true, fileExists: false, detail: "bootstrap-schema.sql introuvable" };
  }

  if (options.presenceOnly) {
    return { driftDetected: false, fileExists: true };
  }

  try {
    const expected = execSync(
      "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script",
      { encoding: "utf8", cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
    )
      .replace(/\r\n/g, "\n")
      .trim();
    const onDisk = fs.readFileSync(bootstrapPath, "utf8").replace(/\r\n/g, "\n").trim();

    if (expected === onDisk) {
      return { driftDetected: false, fileExists: true };
    }

    const expectedTables = [...expected.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort();
    const diskTables = [...onDisk.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort();
    const missing = expectedTables.filter((t) => !diskTables.includes(t));
    const extra = diskTables.filter((t) => !expectedTables.includes(t));

    return {
      driftDetected: true,
      fileExists: true,
      detail:
        missing.length || extra.length
          ? `Tables divergentes — manquantes: ${missing.join(", ") || "—"} ; en trop: ${extra.join(", ") || "—"}`
          : "SQL bootstrap différent du schéma Prisma (contenu non identique)",
    };
  } catch (error) {
    return {
      driftDetected: true,
      fileExists: true,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
