import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { PrismaClient } from "../prisma-client.js";
import { getDatabaseFilePath } from "../database.js";
import { prismaIntegritySummary } from "./db-maintenance.js";
import { resolveBackupDirectory } from "./backup-service.js";
import {
  detectCorruptedSessionPayload,
  safeReadSession,
  persistSession,
} from "./auth-service.js";

/** Warn when free space on a volume drops below this threshold (factory PCs). */
export const MIN_FREE_DISK_BYTES = 500 * 1024 * 1024;

export type StartupHealthReport = {
  ok: boolean;
  integrity: { ok: boolean; preview: string[] };
  writablePaths: {
    userDataOk: boolean;
    databaseDirOk: boolean;
    backupDirOk: boolean;
    backupDirPath: string;
    errors: string[];
  };
  sqliteSidecars: {
    walExists: boolean;
    shmExists: boolean;
    journalExists: boolean;
    note: string;
  };
  session: {
    corrupted: boolean;
    cleared: boolean;
    detail?: string;
  };
  diskSpace: {
    userDataFreeBytes: number | null;
    backupDirFreeBytes: number | null;
    lowSpaceWarning: boolean;
  };
};

function tryAccessWritable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.samy-write-probe-${process.pid}`);
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function freeBytesOnPath(targetPath: string): number | null {
  try {
    const st = fs.statSync(targetPath);
    if (typeof st.dev === "undefined") return null;
    /** Node 18+ — Windows/macOS/Linux where supported */
    if (typeof (fs as { statfsSync?: (p: string) => { bavail: number; bsize: number } }).statfsSync === "function") {
      const statfs = (fs as { statfsSync: (p: string) => { bavail: number; bsize: number } }).statfsSync;
      const root = st.isDirectory() ? targetPath : path.dirname(targetPath);
      const info = statfs(root);
      return Number(info.bavail) * Number(info.bsize);
    }
    return null;
  } catch {
    return null;
  }
}

function sqliteSidecarPaths(dbPath: string): { wal: string; shm: string; journal: string } {
  return {
    wal: `${dbPath}-wal`,
    shm: `${dbPath}-shm`,
    journal: `${dbPath}-journal`,
  };
}

export async function runStartupHealthChecks(prisma: PrismaClient): Promise<StartupHealthReport> {
  const dbPath = getDatabaseFilePath();
  const dbDir = path.dirname(dbPath);
  const userData = app.getPath("userData");
  const sidecars = sqliteSidecarPaths(dbPath);

  const integrity = await prismaIntegritySummary(prisma);

  const writableErrors: string[] = [];
  const userDataOk = tryAccessWritable(userData);
  if (!userDataOk) writableErrors.push("userData non inscriptible");

  const databaseDirOk = tryAccessWritable(dbDir);
  if (!databaseDirOk) writableErrors.push("répertoire base SQLite non inscriptible");

  let backupDirPath = "";
  let backupDirOk = false;
  try {
    backupDirPath = await resolveBackupDirectory(prisma);
    await fsPromises.mkdir(backupDirPath, { recursive: true });
    backupDirOk = tryAccessWritable(backupDirPath);
    if (!backupDirOk) writableErrors.push("répertoire sauvegardes non inscriptible");
  } catch (error) {
    writableErrors.push(
      error instanceof Error ? error.message : "répertoire sauvegardes inaccessible",
    );
  }

  const sessionCorruption = detectCorruptedSessionPayload(safeReadSession());
  let sessionCleared = false;
  if (sessionCorruption.corrupted) {
    persistSession(null);
    sessionCleared = true;
  }

  const userDataFreeBytes = freeBytesOnPath(userData);
  const backupDirFreeBytes = backupDirPath ? freeBytesOnPath(backupDirPath) : null;
  const lowSpaceWarning =
    (userDataFreeBytes !== null && userDataFreeBytes < MIN_FREE_DISK_BYTES) ||
    (backupDirFreeBytes !== null && backupDirFreeBytes < MIN_FREE_DISK_BYTES);

  const walExists = fs.existsSync(sidecars.wal);
  const shmExists = fs.existsSync(sidecars.shm);
  const journalExists = fs.existsSync(sidecars.journal);

  const ok =
    integrity.ok &&
    userDataOk &&
    databaseDirOk &&
    backupDirOk &&
    !sessionCorruption.corrupted &&
    !lowSpaceWarning;

  return {
    ok,
    integrity: {
      ok: integrity.ok,
      preview: integrity.lines.slice(0, 5),
    },
    writablePaths: {
      userDataOk,
      databaseDirOk,
      backupDirOk,
      backupDirPath,
      errors: writableErrors,
    },
    sqliteSidecars: {
      walExists,
      shmExists,
      journalExists,
      note: walExists
        ? "Fichiers WAL présents — récupération normale après arrêt brutal possible."
        : "Pas de sidecar WAL actif.",
    },
    session: {
      corrupted: sessionCorruption.corrupted,
      cleared: sessionCleared,
      detail: sessionCorruption.detail,
    },
    diskSpace: {
      userDataFreeBytes,
      backupDirFreeBytes,
      lowSpaceWarning,
    },
  };
}
