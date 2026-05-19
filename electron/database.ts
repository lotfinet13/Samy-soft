import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "./prisma-client.js";
import { app } from "electron";
import { parseReleaseChannel, resolveDatabaseBasename, userDataChannelSegment } from "../shared/release-channel.js";

let prisma: PrismaClient | null = null;

export function getDatabaseFilePath(): string {
  const testRaw =
    typeof process.env.SAMY_TEST_DATABASE_PATH === "string"
      ? process.env.SAMY_TEST_DATABASE_PATH.trim()
      : "";
  const e2eRaw =
    typeof process.env.SAMY_E2E_DATABASE_PATH === "string"
      ? process.env.SAMY_E2E_DATABASE_PATH.trim()
      : "";
  /** Éviter qu'un `.env` de dev (`SAMY_TEST_DATABASE_PATH`) ne prenne le pas sur la base Playwright (`SAMY_E2E_DATABASE_PATH`). */
  const fromEnv =
    process.env.SAMY_E2E === "1" && e2eRaw.length > 0 ? e2eRaw : testRaw || e2eRaw;

  if (fromEnv.length > 0) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv);
  }
  const channel = parseReleaseChannel(process.env.SAMY_RELEASE_CHANNEL);
  const basename = resolveDatabaseBasename(channel);
  if (app.isPackaged) {
    const segment = userDataChannelSegment(channel);
    const root = segment ? path.join(app.getPath("userData"), segment) : app.getPath("userData");
    return path.join(root, basename);
  }
  const devDir = channel === "production" ? ".data" : path.join(".data", channel);
  return path.join(process.cwd(), devDir, basename);
}

/**
 * Prisma SQLite sous Windows attend typiquement `file:D:/chemin/db.sqlite` (slashes POSIX).
 * `pathToFileURL` produit `file:///D:/...` et peut provoquer l'erreur « Unable to open the database file ».
 */
export function configureDatabaseUrl(): string {
  const dbPath = getDatabaseFilePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const posix = dbPath.replace(/\\/g, "/");
  const url = posix.startsWith("/") ? `file:${posix}` : `file:${posix}`;
  process.env.DATABASE_URL = url;
  return url;
}

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return prisma;
}

export type DatabaseRuntimeProfile = {
  provider: "sqlite";
  deploymentMode: "single-user-local" | "future-shared-lan";
  databasePath: string;
  databaseUrl: string;
};

export function getDatabaseRuntimeProfile(): DatabaseRuntimeProfile {
  return {
    provider: "sqlite",
    deploymentMode: "single-user-local",
    databasePath: getDatabaseFilePath(),
    databaseUrl: process.env.DATABASE_URL ?? configureDatabaseUrl(),
  };
}

export async function runDbTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return getPrisma().$transaction(callback);
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

export async function reconnectPrisma(): Promise<PrismaClient> {
  await disconnectPrisma();
  return getPrisma();
}
