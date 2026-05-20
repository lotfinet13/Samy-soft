import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { PrismaClient } from "../prisma-client.js";
import { getDatabaseFilePath } from "../database.js";
import { logActivity } from "./activity-service.js";

const MARKER_FILENAME = "last-clean-shutdown.json";

export type ShutdownMarker = {
  at: string;
  pid: number;
  version: string;
};

function markerPath(): string {
  return path.join(app.getPath("userData"), MARKER_FILENAME);
}

export async function writeCleanShutdownMarker(): Promise<void> {
  const payload: ShutdownMarker = {
    at: new Date().toISOString(),
    pid: process.pid,
    version: app.getVersion(),
  };
  await fsPromises.mkdir(path.dirname(markerPath()), { recursive: true });
  await fsPromises.writeFile(markerPath(), JSON.stringify(payload), "utf8");
}

export async function readPreviousShutdownMarker(): Promise<ShutdownMarker | null> {
  try {
    const raw = await fsPromises.readFile(markerPath(), "utf8");
    const parsed = JSON.parse(raw) as ShutdownMarker;
    if (typeof parsed?.at === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * If the previous run did not write a clean-shutdown marker, record an audit row once per boot.
 */
function databasePreExisted(): boolean {
  try {
    const st = fs.statSync(getDatabaseFilePath());
    return st.size > 0;
  } catch {
    return false;
  }
}

export async function auditAbnormalShutdownIfNeeded(prisma: PrismaClient): Promise<{
  abnormalDetected: boolean;
  previousMarker: ShutdownMarker | null;
}> {
  const previous = await readPreviousShutdownMarker();
  const abnormalDetected = previous === null && databasePreExisted();

  if (!abnormalDetected) {
    return { abnormalDetected: false, previousMarker: previous };
  }

  await logActivity(prisma, {
    userId: null,
    action: "ABNORMAL_SHUTDOWN",
    entityType: "system",
    metadata: {
      note: "Dernier arrêt non marqué comme propre (coupure secteur, crash ou kill processus).",
      bootAt: new Date().toISOString(),
    },
  });

  return { abnormalDetected: true, previousMarker: null };
}
