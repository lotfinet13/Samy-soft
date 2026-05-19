import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import {
  backupRestorePayloadSchema,
  backupVerifyPayloadSchema,
  activityQueryPayloadSchema,
  activityExportPayloadSchema,
} from "../../shared/schemas/phase7-system.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { getDatabaseFilePath, getPrisma } from "../database.js";
import { resolveSessionUser, sessionHasPermission } from "../services/auth-service.js";
import {
  exportDatabaseBackup,
  getBackupHealth,
  listBackups,
  restoreDatabaseFromBackup,
  resolveBackupAbsolutePath,
  verifyBackupArchive,
  BACKUP_FORMAT,
} from "../services/backup-service.js";
import {
  logActivity,
  queryActivityPaged,
  stringifyActivityCsv,
} from "../services/activity-service.js";
import {
  prismaIntegritySummary,
  pragmasDiagnostics,
  foreignKeyViolations,
  migrationsList,
  sqliteFileStats,
  vacuumDatabase,
  approximateRowCounts,
} from "../services/db-maintenance.js";
import { runBusinessIntegrityScan } from "../services/data-integrity-service.js";
import { checkForUpdatesPlanned } from "../services/update-service.js";
import {
  exportDiagnosticZipBundle,
} from "../services/diagnostic-bundle-service.js";
import { runDeploymentCertification } from "../services/deployment-cert-service.js";
import { getQaOverview, recordIntegrityScanResult } from "../services/qa-metrics-service.js";
import { runStartupDiagnostics } from "../services/startup-diagnostics-service.js";

function sessionGate(user: NonNullable<Awaited<ReturnType<typeof resolveSessionUser>>>) {
  return {
    settingsRead(): void {
      if (!sessionHasPermission(user.role.permissions, PERMISSIONS.SETTINGS_READ)) {
        throw new Error("Permission refusée.");
      }
    },
    settingsWrite(): void {
      if (!sessionHasPermission(user.role.permissions, PERMISSIONS.SETTINGS_WRITE)) {
        throw new Error("Permission refusée.");
      }
    },
  };
}

function mapActivityRow(r: {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: string;
  createdAt: Date;
  user: {
    id: string;
    username: string;
    displayName: string;
  } | null;
}) {
  let parsedMeta: unknown = {};
  try {
    parsedMeta = JSON.parse(r.metadata || "{}") as unknown;
  } catch {
    parsedMeta = {};
  }

  return {
    id: r.id,
    userId: r.userId,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: parsedMeta,
    createdAt: r.createdAt.toISOString(),
    user: r.user,
  };
}

export function registerSystemHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.BACKUP_EXPORT, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    if (!sessionHasPermission(user.role.permissions, PERMISSIONS.BACKUP_EXPORT)) {
      throw new Error("Permission refusée.");
    }
    const created = await exportDatabaseBackup(prisma, user.id);
    await logActivity(prisma, {
      userId: user.id,
      action: "BACKUP_EXPORT",
      entityType: "backup_record",
      entityId: created.recordId,
      metadata: { filename: created.filename, format: "ZIP_V1" },
    });
    return created;
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_LIST, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    if (!sessionHasPermission(user.role.permissions, PERMISSIONS.BACKUP_EXPORT)) {
      throw new Error("Permission refusée.");
    }
    const rows = await listBackups(prisma);
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    }));
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_VERIFY, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    if (!sessionHasPermission(user.role.permissions, PERMISSIONS.BACKUP_EXPORT)) {
      throw new Error("Permission refusée.");
    }
    const body = backupVerifyPayloadSchema.parse(payload ?? {});
    await verifyBackupArchive(prisma, body.backupId);
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_HEALTH, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    sessionGate(user).settingsRead();
    return getBackupHealth(prisma);
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_RESTORE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    if (!sessionHasPermission(user.role.permissions, PERMISSIONS.BACKUP_RESTORE)) {
      throw new Error("Permission refusée.");
    }
    const body = backupRestorePayloadSchema.parse(payload ?? {});
    const rec = await resolveBackupAbsolutePath(prisma, body.backupId);
    if (!rec) throw new Error("Identifiant de sauvegarde inconnu.");

    if (!body.skipVerify) {
      const isZip =
        rec.format === BACKUP_FORMAT.ZIP_V1 ||
        rec.absolutePath.toLowerCase().endsWith(".zip");
      if (isZip) {
        await verifyBackupArchive(prisma, body.backupId);
      }
    }

    const absolutePathSnapshot = rec.absolutePath;
    const backupIdSnap = body.backupId;
    await restoreDatabaseFromBackup(prisma, absolutePathSnapshot, rec.format ?? null);

    const prismaFresh = getPrisma();
    await logActivity(prismaFresh, {
      userId: user.id,
      action: "BACKUP_RESTORE",
      entityType: "backup_record",
      entityId: backupIdSnap,
      metadata: { absolutePathSnapshot },
    });

    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_LIST, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    if (!sessionHasPermission(user.role.permissions, PERMISSIONS.ACTIVITY_READ)) {
      throw new Error("Permission refusée.");
    }
    const { items } = await queryActivityPaged(prisma, {
      offset: 0,
      take: 150,
    });
    return items.map(mapActivityRow);
  });

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_QUERY, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    if (!sessionHasPermission(user.role.permissions, PERMISSIONS.ACTIVITY_READ)) {
      throw new Error("Permission refusée.");
    }
    const body = activityQueryPayloadSchema.parse(payload ?? {});
    const { items, total, hasMore } = await queryActivityPaged(prisma, body);
    return {
      rows: items.map(mapActivityRow),
      total,
      hasMore,
    };
  });

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_EXPORT_CSV, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    if (!sessionHasPermission(user.role.permissions, PERMISSIONS.ACTIVITY_READ)) {
      throw new Error("Permission refusée.");
    }
    const body = activityExportPayloadSchema.parse(payload ?? {});
    const limit = Math.min(Math.max(body.exportLimit ?? 2000, 10), 5000);
    const { items } = await queryActivityPaged(prisma, {
      ...body,
      offset: 0,
      take: limit,
    });
    return {
      mimeType: "text/csv" as const,
      filenameSuggested: `audit_samy-soft_${Date.now()}.csv`,
      content: stringifyActivityCsv(items),
    };
  });

  ipcMain.handle(IPC_CHANNELS.DB_MAINT_SUMMARY, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    sessionGate(user).settingsRead();
    const [integrity, pragmas, fkViolations, migr, rowsApprox, sqlite] = await Promise.all([
      prismaIntegritySummary(prisma),
      pragmasDiagnostics(prisma),
      foreignKeyViolations(prisma),
      migrationsList(prisma),
      approximateRowCounts(prisma),
      Promise.resolve(sqliteFileStats()),
    ]);
    return {
      integrityPreview: integrity.lines.slice(0, 3),
      integrityOk: integrity.ok,
      pragmas,
      foreignKeyIssues: fkViolations,
      migrations: migr,
      rowApprox: rowsApprox,
      sqlite,
    };
  });

  ipcMain.handle(IPC_CHANNELS.DB_MAINT_INTEGRITY_CHECK, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    sessionGate(user).settingsRead();
    return prismaIntegritySummary(prisma);
  });

  ipcMain.handle(IPC_CHANNELS.DB_MAINT_FOREIGN_KEYS, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    sessionGate(user).settingsRead();
    return foreignKeyViolations(prisma);
  });

  ipcMain.handle(IPC_CHANNELS.DB_MAINT_VACUUM, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    sessionGate(user).settingsWrite();
    await vacuumDatabase(prisma);
    await logActivity(prisma, {
      userId: user.id,
      action: "DB_MAINTENANCE_VACUUM",
      entityType: "database",
      metadata: {},
    });
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.DB_DATA_INTEGRITY_SCAN, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    sessionGate(user).settingsRead();
    const report = await runBusinessIntegrityScan(prisma);
    recordIntegrityScanResult(report);
    await logActivity(prisma, {
      userId: user.id,
      action: "DATA_INTEGRITY_SCAN",
      entityType: "database",
      metadata: { ok: report.ok, findings: report.findings.length },
    });
    return report;
  });

  ipcMain.handle(IPC_CHANNELS.QA_OVERVIEW_GET, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    sessionGate(user).settingsRead();
    const qa = getQaOverview();
    const backupHealth = await getBackupHealth(prisma).catch(() => null);
    return {
      integrityHistory: qa.integrityHistory,
      lastDeploymentCert: qa.lastDeploymentCert,
      backupHealth,
    };
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_DEPLOYMENT_CERT_RUN, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    sessionGate(user).settingsRead();
    const cert = await runDeploymentCertification(prisma);
    await logActivity(prisma, {
      userId: user.id,
      action: "DEPLOYMENT_CERT_RUN",
      entityType: "system",
      metadata: { overallOk: cert.overallOk, checks: cert.checks.map((c) => c.id) },
    });
    return cert;
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_DIAGNOSTICS_EXPORT, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    sessionGate(user).settingsWrite();
    const qa = getQaOverview();
    const created = await exportDiagnosticZipBundle({
      prisma,
      deploymentCert: qa.lastDeploymentCert,
    });
    await logActivity(prisma, {
      userId: user.id,
      action: "DIAGNOSTICS_EXPORT",
      entityType: "system",
      metadata: { absolutePathHint: "(userData diagnostics folder)" },
    });
    return created;
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_STARTUP_DIAGNOSTICS, async () => {
    const prisma = getPrisma();
    return runStartupDiagnostics(prisma);
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_SMOKE_MAIN_SELFTEST, async () => {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    const base = {
      ok: true as const,
      electron: process.versions?.electron ?? "unknown",
      node: process.versions.node,
      uptimeSeconds: Math.floor(process.uptime()),
    };
    return process.env.SAMY_E2E === "1"
      ? { ...base, databaseFilePath: getDatabaseFilePath() }
      : base;
  });

  ipcMain.handle(IPC_CHANNELS.APP_UPDATES_PROBE, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    sessionGate(user).settingsRead();
    return checkForUpdatesPlanned({ channel: "stable" });
  });

  ipcMain.handle(IPC_CHANNELS.DB_HEALTH, async () => {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true as const };
  });
}
