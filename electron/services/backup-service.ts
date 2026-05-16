import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { app } from "electron";
import AdmZip from "adm-zip";
import type { PrismaClient } from "@prisma/client";
import { APP_SETTING_KEYS } from "../../shared/settings-keys.js";
import {
  disconnectPrisma,
  getDatabaseFilePath,
  reconnectPrisma,
} from "../database.js";

export const BACKUP_FORMAT = {
  ZIP_V1: "ZIP_V1",
  LEGACY_SQLITE: "LEGACY_SQLITE",
} as const;

export type BackupFormat = (typeof BACKUP_FORMAT)[keyof typeof BACKUP_FORMAT];

export const INTEGRITY = {
  UNKNOWN: "UNKNOWN",
  VERIFIED_OK: "VERIFIED_OK",
  CORRUPT_ZIP: "CORRUPT_ZIP",
  MANIFEST_MISMATCH: "MANIFEST_MISMATCH",
  MISSING_ENTRY: "MISSING_ENTRY",
  LEGACY_FILE: "LEGACY_FILE",
} as const;

const ZIP_DB_ENTRY = "database.sqlite";
const ZIP_MANIFEST_ENTRY = "manifest.json";

export type BackupManifestV1 = {
  version: 1;
  sqliteSha256: string;
  createdAtUtc: string;
  appVersion: string;
};

export async function resolveBackupDirectory(prisma: PrismaClient): Promise<string> {
  const row = await prisma.appSetting.findUnique({
    where: { key: APP_SETTING_KEYS.BACKUP_DIRECTORY },
  });
  const configured = row?.value?.trim();
  if (configured) return configured;
  return path.join(app.getPath("documents"), "SAMY-SOFT", "sauvegardes");
}

async function resolveRetentionMax(prisma: PrismaClient): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { key: APP_SETTING_KEYS.BACKUP_RETENTION_MAX },
  });
  const raw = Number.parseInt(row?.value ?? "", 10);
  if (!Number.isFinite(raw) || raw < 3) return 30;
  return Math.min(500, raw);
}

async function sha256Buffer(buf: Buffer): Promise<string> {
  const hash = crypto.createHash("sha256");
  hash.update(buf);
  return hash.digest("hex");
}

async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return sha256Buffer(buf);
}

async function prismaCheckpoint(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe("PRAGMA wal_checkpoint(FULL);");
  } catch {
    // checkpoint best-effort
  }
}

/**
 * ZIP contenant database.sqlite + manifest.json (checksum logique SQLite).
 */
export async function exportDatabaseBackup(
  prisma: PrismaClient,
  createdById?: string | null,
): Promise<{
  recordId: string;
  absolutePath: string;
  filename: string;
}> {
  const dir = await resolveBackupDirectory(prisma);
  await fs.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replaceAll(":", "-");
  const filename = `samy-soft-${stamp}.zip`;
  const targetPath = path.join(dir, filename);
  const sourceDb = getDatabaseFilePath();

  await prismaCheckpoint(prisma);
  const sqliteBytes = await fs.readFile(sourceDb);
  const sqliteSha256 = await sha256Buffer(sqliteBytes);

  const manifest: BackupManifestV1 = {
    version: 1,
    sqliteSha256,
    createdAtUtc: new Date().toISOString(),
    appVersion: app.getVersion(),
  };

  const zip = new AdmZip();
  zip.addFile(ZIP_DB_ENTRY, sqliteBytes);
  zip.addFile(ZIP_MANIFEST_ENTRY, Buffer.from(JSON.stringify(manifest, null, 0)));
  zip.writeZip(targetPath);

  const archiveBytes = await fs.readFile(targetPath);
  const checksumSha256 = await sha256Buffer(archiveBytes);
  const stat = await fs.stat(targetPath);

  const record = await prisma.backupRecord.create({
    data: {
      filename,
      absolutePath: targetPath,
      sizeBytes: Number(stat.size),
      checksumSha256,
      format: BACKUP_FORMAT.ZIP_V1,
      integrityStatus: INTEGRITY.VERIFIED_OK,
      verifiedAt: new Date(),
      createdById: createdById ?? undefined,
    },
  });

  await applyRetentionPolicies(prisma, dir);

  return { recordId: record.id, absolutePath: targetPath, filename };
}

export async function listBackups(prisma: PrismaClient) {
  return prisma.backupRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

async function applyRetentionPolicies(prisma: PrismaClient, backupDirHint: string): Promise<void> {
  const max = await resolveRetentionMax(prisma);
  const rows = await prisma.backupRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: max + 200,
    select: { id: true, absolutePath: true },
  });

  const toRemove = rows.slice(max);
  for (const row of toRemove) {
    try {
      await fs.unlink(row.absolutePath);
    } catch {
      /* fichier déjà manquant ou accès refusé */
    }
    await prisma.backupRecord.delete({ where: { id: row.id } }).catch(() => undefined);
  }

  /** Purge fichier orphelin très anciens dans dossier (> 540 jours) — garde dossier propre. */
  const names = await fs.readdir(backupDirHint).catch(() => [] as string[]);
  const now = Date.now();
  const graceMs = 540 * 86400_000;
  for (const n of names) {
    const full = path.join(backupDirHint, n);
    if (!(n.endsWith(".zip") || n.endsWith(".sqlite"))) continue;
    const st = await fs.stat(full).catch(() => null);
    if (!st?.isFile()) continue;
    if (now - st.mtimeMs < graceMs) continue;
    const stillLinked = await prisma.backupRecord.count({ where: { absolutePath: full } });
    if (stillLinked > 0) continue;
    await fs.unlink(full).catch(() => undefined);
  }
}

export async function resolveBackupAbsolutePath(prisma: PrismaClient, backupId: string) {
  return prisma.backupRecord.findUnique({
    where: { id: backupId },
  });
}

function readZipEntries(zipPath: string): { sqlite: Buffer; manifest: BackupManifestV1 } | null {
  try {
    const zip = new AdmZip(zipPath);
    const dbEntry = zip.getEntry(ZIP_DB_ENTRY)?.getData();
    const mfRaw = zip.getEntry(ZIP_MANIFEST_ENTRY)?.getData()?.toString("utf8");
    if (!dbEntry?.length || !mfRaw?.length) return null;
    const manifest = JSON.parse(mfRaw) as BackupManifestV1;
    if (manifest.version !== 1 || typeof manifest.sqliteSha256 !== "string") return null;
    return { sqlite: dbEntry, manifest };
  } catch {
    return null;
  }
}

/** Vérifie cohérence manifeste ↔ contenu SQLite (et archive lisible). */
export async function verifyBackupArchive(prisma: PrismaClient, backupId: string) {
  const rec = await prisma.backupRecord.findUnique({ where: { id: backupId } });
  if (!rec) throw new Error("Sauvegarde introuvable.");
  await verifyBackupDiskPath(prisma, rec.absolutePath, rec.id);
}

export async function verifyBackupDiskPath(
  prisma: PrismaClient,
  absolutePath: string,
  recordId?: string,
): Promise<{
  status: (typeof INTEGRITY)[keyof typeof INTEGRITY];
}> {
  const ext = absolutePath.toLowerCase();
  if (ext.endsWith(".sqlite")) {
    await fs.access(absolutePath);
    const st = await fs.stat(absolutePath);
    if (!st.isFile()) throw new Error("Fichier de sauvegarde invalide.");
    if (recordId) {
      await prisma.backupRecord.update({
        where: { id: recordId },
        data: { integrityStatus: INTEGRITY.LEGACY_FILE, verifiedAt: new Date() },
      });
    }
    return { status: INTEGRITY.LEGACY_FILE };
  }

  if (!absolutePath.toLowerCase().endsWith(".zip")) {
    throw new Error("Extension de fichier non supportée.");
  }

  const entries = readZipEntries(absolutePath);
  if (!entries) {
    const status = INTEGRITY.CORRUPT_ZIP;
    if (recordId) {
      await prisma.backupRecord.update({
        where: { id: recordId },
        data: { integrityStatus: status },
      });
    }
    throw new Error("Archive ZIP corrompue ou structure inconnue.");
  }

  const innerHash = await sha256Buffer(entries.sqlite);
  if (innerHash !== entries.manifest.sqliteSha256) {
    if (recordId) {
      await prisma.backupRecord.update({
        where: { id: recordId },
        data: { integrityStatus: INTEGRITY.MANIFEST_MISMATCH },
      });
    }
    throw new Error("Contrôle d’intégrité : fichier SQLite dans l’archive ne correspond pas au manifeste.");
  }

  const zipSha256 = await sha256File(absolutePath);
  if (recordId) {
    const recForSha = await prisma.backupRecord.findUnique({ where: { id: recordId } });
    if (recForSha?.checksumSha256 && zipSha256 !== recForSha.checksumSha256) {
      await prisma.backupRecord.update({
        where: { id: recordId },
        data: { integrityStatus: INTEGRITY.MANIFEST_MISMATCH },
      });
      throw new Error("Empreinte de l’archive ne correspond pas à l’historique enregistré.");
    }

    await prisma.backupRecord.update({
      where: { id: recordId },
      data: { integrityStatus: INTEGRITY.VERIFIED_OK, verifiedAt: new Date() },
    });
  }

  return { status: INTEGRITY.VERIFIED_OK };
}

export async function restoreDatabaseFromBackup(
  prisma: PrismaClient,
  backupAbsolutePath: string,
  formatHint?: string | null,
): Promise<void> {
  const normalizedPath = path.normalize(backupAbsolutePath);

  /** Restriction : dossier configuré utilisateur OU répertoire temporaire système ou userData export. */
  const dir = await resolveBackupDirectory(prisma);
  const userDataRoot = path.normalize(app.getPath("userData"));
  const docsRoot = path.normalize(path.join(app.getPath("documents"), "SAMY-SOFT"));

  type AllowEntry = string;
  const allowedRoots = new Set<AllowEntry>(
    [
      dir,
      userDataRoot,
      docsRoot,
      path.normalize(os.tmpdir()),
    ].map((x) => path.normalize(x)),
  );

  let allowed = [...allowedRoots].some((root) => {
    try {
      return normalizedPath.startsWith(root + path.sep) || normalizedPath === root;
    } catch {
      return false;
    }
  });

  if (!allowed) {
    /** Cas import — fichier hors dossier défaut mais explicitement présent comme BackupRecord.abs */
    const rec = await prisma.backupRecord.findFirst({
      where: { absolutePath: normalizedPath },
    });
    allowed = !!rec;
  }

  if (!allowed) {
    throw new Error("Chemins restaurables limités aux sauvegardes enregistrées ou au dossier de sauvegarde.");
  }

  const srcStat = await fs.stat(normalizedPath).catch(() => null);
  if (!srcStat?.isFile()) {
    throw new Error("Fichier de sauvegarde introuvable.");
  }

  const isZip =
    formatHint === BACKUP_FORMAT.ZIP_V1 ||
    normalizedPath.toLowerCase().endsWith(".zip");

  if (isZip) {
    const entries = readZipEntries(normalizedPath);
    if (!entries) throw new Error("ZIP illisible — restauration annulée.");
    const innerHash = await sha256Buffer(entries.sqlite);
    if (innerHash !== entries.manifest.sqliteSha256) {
      throw new Error("Contrôle avant restauration : incohérence manifeste ZIP.");
    }
    const tmp = path.join(app.getPath("temp"), `samy-restore-${crypto.randomUUID()}.sqlite`);
    await fs.writeFile(tmp, entries.sqlite);
    try {
      const active = getDatabaseFilePath();
      await disconnectPrisma();
      await fs.copyFile(tmp, active);
      await reconnectPrisma();
    } finally {
      await fs.unlink(tmp).catch(() => undefined);
    }
    return;
  }

  const activeLegacy = getDatabaseFilePath();
  await disconnectPrisma();
  await fs.copyFile(normalizedPath, activeLegacy);
  await reconnectPrisma();
}

export async function getBackupHealth(prisma: PrismaClient): Promise<{
  lastBackupAt: string | null;
  lastIntegrityStatus: string | null;
  hoursSinceBackup: number | null;
  warningStale: boolean;
}> {
  const latest = await prisma.backupRecord.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, integrityStatus: true },
  });
  const lastBackupAt = latest?.createdAt ? latest.createdAt.toISOString() : null;
  const lastIntegrityStatus = latest?.integrityStatus ?? null;
  let hoursSinceBackup: number | null = null;
  let warningStale = false;
  if (latest?.createdAt) {
    hoursSinceBackup = (Date.now() - latest.createdAt.getTime()) / (3600_000);
    const intervalRow = await prisma.appSetting.findUnique({
      where: { key: APP_SETTING_KEYS.BACKUP_AUTO_INTERVAL_HOURS },
    });
    const auto = await prisma.appSetting.findUnique({
      where: { key: APP_SETTING_KEYS.BACKUP_AUTO_ENABLED },
    });
    const intervalHours = Math.max(
      1,
      Number.parseInt(intervalRow?.value ?? "24", 10) || 24,
    );
    if (auto?.value === "true" && hoursSinceBackup > intervalHours * 2) warningStale = true;
    else if ((!auto?.value || auto.value === "false") && hoursSinceBackup > 24 * 7) warningStale = true;
  } else warningStale = true;

  return { lastBackupAt, lastIntegrityStatus, hoursSinceBackup, warningStale };
}
