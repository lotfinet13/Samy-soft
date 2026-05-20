import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";

import { computePendingMigrationNames } from "../../shared/migration-drift.js";
import { detectBootstrapSchemaDrift as detectBootstrapSchemaDriftCore } from "../../scripts/bootstrap-schema-drift.js";
import type { PrismaClient } from "../prisma-client.js";
import { findBootstrapSchemaSqlPath } from "../utils/packaged-runtime-paths.js";
import { getLastSqlitePragmaSnapshot } from "../database.js";
import { runBusinessIntegrityScan } from "./data-integrity-service.js";
import { foreignKeyViolations, migrationsList, pragmasDiagnostics } from "./db-maintenance.js";
import { runStartupHealthChecks, type StartupHealthReport } from "./startup-health-service.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export type StartupDiagnostics = {
  ok: boolean;
  degraded: boolean;
  at: string;
  bootstrapSchema: {
    fileExists: boolean;
    driftDetected: boolean;
    detail?: string;
  };
  migrations: {
    ok: boolean;
    appliedCount: number;
    pendingCount: number;
    pendingNames: string[];
  };
  foreignKeys: { ok: boolean; violations: string[] };
  businessIntegrity: { ok: boolean; issueCount: number; issues: Array<{ code: string; message: string }> };
  sqlite: {
    journalMode: string;
    busyTimeoutMs: number;
    foreignKeysOn: boolean;
  };
  health: StartupHealthReport;
};

export function detectBootstrapSchemaDrift(): { driftDetected: boolean; detail?: string; fileExists: boolean } {
  const bootstrapPath = findBootstrapSchemaSqlPath();
  if (!bootstrapPath) {
    return {
      driftDetected: true,
      fileExists: false,
      detail: "bootstrap-schema.sql introuvable (ressources packagées ou dépôt dev)",
    };
  }
  if (app.isPackaged) {
    return detectBootstrapSchemaDriftCore({ bootstrapPath, presenceOnly: true });
  }
  const repoRoot = path.dirname(path.dirname(bootstrapPath));
  return detectBootstrapSchemaDriftCore({ bootstrapPath, repoRoot });
}

export { computePendingMigrationNames } from "../../shared/migration-drift.js";

function listExpectedMigrationFolders(): string[] {
  const migrationsDir = path.join(moduleDir, "..", "..", "prisma", "migrations");
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();
}

async function migrationDriftSummary(prisma: PrismaClient): Promise<StartupDiagnostics["migrations"]> {
  /** E2E DB is prepared via `prisma db push` — folder-level migrate parity does not apply. */
  if (process.env.SAMY_E2E === "1" || process.argv.includes("--samy-e2e")) {
    return { ok: true, appliedCount: 0, pendingCount: 0, pendingNames: [] };
  }

  /**
   * Packaged installs ship `bootstrap-schema.sql` only (extraResources), not `prisma/migrations/`.
   * Upgrade path is runbook + `migrate deploy` on a copy — not folder parity at runtime.
   */
  if (app.isPackaged) {
    const appliedRows = await migrationsList(prisma);
    const appliedFinished = appliedRows
      .filter((r) => r.finished_at && !r.rolled_back_at)
      .map((r) => r.migration_name);
    return {
      ok: true,
      appliedCount: appliedFinished.length,
      pendingCount: 0,
      pendingNames: [],
    };
  }

  const expected = listExpectedMigrationFolders();
  const appliedRows = await migrationsList(prisma);
  const appliedFinished = appliedRows
    .filter((r) => r.finished_at && !r.rolled_back_at)
    .map((r) => r.migration_name);
  const pendingNames = computePendingMigrationNames(expected, appliedFinished);
  return {
    ok: pendingNames.length === 0,
    appliedCount: appliedFinished.length,
    pendingCount: pendingNames.length,
    pendingNames: pendingNames.slice(0, 12),
  };
}

export async function runStartupDiagnostics(prisma: PrismaClient): Promise<StartupDiagnostics> {
  const isE2E =
    process.env.SAMY_E2E === "1" || process.argv.includes("--samy-e2e");
  const bootstrapSchema = isE2E
    ? { fileExists: true, driftDetected: false }
    : detectBootstrapSchemaDrift();
  const migrations = await migrationDriftSummary(prisma);
  const fkRows = await foreignKeyViolations(prisma);
  const fkViolations = fkRows.map((r) => `${r.table ?? "?"}:${r.rowid ?? "?"}`);

  let businessIntegrity: StartupDiagnostics["businessIntegrity"] = {
    ok: true,
    issueCount: 0,
    issues: [],
  };
  try {
    const scan = await runBusinessIntegrityScan(prisma);
    businessIntegrity = {
      ok: scan.ok,
      issueCount: scan.findings.length,
      issues: scan.findings.slice(0, 12).map((i) => ({ code: i.code, message: i.message })),
    };
  } catch (error) {
    businessIntegrity = {
      ok: false,
      issueCount: 1,
      issues: [{ code: "SCAN_FAILED", message: error instanceof Error ? error.message : String(error) }],
    };
  }

  const health = await runStartupHealthChecks(prisma);
  const pragmaSnap = getLastSqlitePragmaSnapshot();
  const pragmaDiag = pragmaSnap ?? {
    journalMode: (await pragmasDiagnostics(prisma)).journalMode,
    busyTimeoutMs: 0,
    foreignKeysOn: true,
  };

  const coreOk = isE2E
    ? !bootstrapSchema.driftDetected && fkViolations.length === 0
    : !bootstrapSchema.driftDetected &&
      migrations.ok &&
      fkViolations.length === 0 &&
      businessIntegrity.ok;

  const ok = coreOk && health.ok && health.integrity.ok;
  const degraded = !ok && (health.integrity.ok || fkViolations.length === 0);

  return {
    ok,
    degraded,
    at: new Date().toISOString(),
    bootstrapSchema,
    migrations,
    foreignKeys: { ok: fkViolations.length === 0, violations: fkViolations },
    businessIntegrity,
    sqlite: {
      journalMode: pragmaDiag.journalMode,
      busyTimeoutMs: pragmaDiag.busyTimeoutMs,
      foreignKeysOn: pragmaDiag.foreignKeysOn,
    },
    health,
  };
}
