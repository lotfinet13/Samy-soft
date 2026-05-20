import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";

import { buildBootstrapSchemaSqlCandidates } from "../../shared/bootstrap-schema-paths.js";

const electronServicesDir = path.dirname(fileURLToPath(import.meta.url));

function devTreeBootstrapPath(): string {
  return path.join(electronServicesDir, "..", "..", "..", "prisma", "bootstrap-schema.sql");
}

export function listBootstrapSchemaSqlCandidates(): string[] {
  return buildBootstrapSchemaSqlCandidates({
    resourcesPath: process.resourcesPath,
    cwd: process.cwd(),
    devTreeBootstrapPath: devTreeBootstrapPath(),
    isPackaged: app.isPackaged,
  });
}

/** ASAR-safe: prefers `extraResources` (`resources/prisma/bootstrap-schema.sql`) when packaged. */
export function findBootstrapSchemaSqlPath(): string | undefined {
  for (const candidate of listBootstrapSchemaSqlCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function resolveBootstrapSchemaSqlPathOrThrow(): string {
  const resolved = findBootstrapSchemaSqlPath();
  if (resolved) return resolved;
  throw new Error(
    "Script bootstrap-schema.sql introuvable. Reconstruisez l'application (npm run build / dist:win).",
  );
}
