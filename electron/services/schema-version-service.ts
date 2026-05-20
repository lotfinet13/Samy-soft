import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { findBootstrapSchemaSqlPath } from "../utils/packaged-runtime-paths.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export type SchemaVersionInfo = {
  /** Short label for UI, e.g. `15637405…ae2fc3` */
  schemaVersion: string;
  schemaPrismaSha256: string;
  bootstrapSqlSha256: string;
};

function readChecksumsManifest(manifestPath: string): SchemaVersionInfo | null {
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      schemaPrismaSha256?: string;
      bootstrapSqlSha256?: string;
    };
    const schemaPrismaSha256 = raw.schemaPrismaSha256?.trim() ?? "";
    const bootstrapSqlSha256 = raw.bootstrapSqlSha256?.trim() ?? "";
    if (!schemaPrismaSha256) return null;
    return {
      schemaPrismaSha256,
      bootstrapSqlSha256,
      schemaVersion: formatSchemaVersionLabel(schemaPrismaSha256),
    };
  } catch {
    return null;
  }
}

export function formatSchemaVersionLabel(schemaPrismaSha256: string): string {
  const h = schemaPrismaSha256.trim().toLowerCase();
  if (h.length < 16) return h || "unknown";
  return `${h.slice(0, 8)}…${h.slice(-8)}`;
}

function resolveChecksumsManifestPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "prisma", "schema-checksums.json"),
    path.join(moduleDir, "..", "..", "prisma", "schema-checksums.json"),
    app.isPackaged
      ? path.join(process.resourcesPath, "prisma", "schema-checksums.json")
      : null,
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Runtime schema fingerprint — falls back to live schema.prisma hash in dev. */
export function getSchemaVersionInfo(): SchemaVersionInfo {
  const manifestPath = resolveChecksumsManifestPath();
  if (manifestPath) {
    const fromManifest = readChecksumsManifest(manifestPath);
    if (fromManifest) return fromManifest;
  }

  const schemaCandidates = [
    path.join(process.cwd(), "prisma", "schema.prisma"),
    path.join(moduleDir, "..", "..", "prisma", "schema.prisma"),
  ];
  for (const schemaPath of schemaCandidates) {
    if (!fs.existsSync(schemaPath)) continue;
    const schemaPrismaSha256 = createHash("sha256")
      .update(fs.readFileSync(schemaPath))
      .digest("hex");
    const bootstrapPath = findBootstrapSchemaSqlPath();
    const bootstrapSqlSha256 = bootstrapPath
      ? createHash("sha256").update(fs.readFileSync(bootstrapPath)).digest("hex")
      : "";
    return {
      schemaPrismaSha256,
      bootstrapSqlSha256,
      schemaVersion: formatSchemaVersionLabel(schemaPrismaSha256),
    };
  }

  return {
    schemaPrismaSha256: "unknown",
    bootstrapSqlSha256: "",
    schemaVersion: "unknown",
  };
}
