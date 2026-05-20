import type { PrismaClient } from "../prisma-client.js";

/** Production SQLite connection profile (local single-user ERP). */
export const SQLITE_BUSY_TIMEOUT_MS = 15_000;
export const SQLITE_JOURNAL_MODE = "WAL";

export type SqlitePragmaSnapshot = {
  journalMode: string;
  busyTimeoutMs: number;
  foreignKeysOn: boolean;
};

export async function applySqliteConnectionPragmas(prisma: PrismaClient): Promise<SqlitePragmaSnapshot> {
  /** Several PRAGMA setters return rows under Prisma — use query, not execute */
  await prisma.$queryRawUnsafe(`PRAGMA journal_mode = ${SQLITE_JOURNAL_MODE};`);
  await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};`);
  await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON;");

  const journalRow = await prisma.$queryRawUnsafe<Array<{ journal_mode?: string }>>(
    "PRAGMA journal_mode;",
  );
  const fkRow = await prisma.$queryRawUnsafe<Array<{ foreign_keys?: number }>>(
    "PRAGMA foreign_keys;",
  );

  return {
    journalMode: String(journalRow[0]?.journal_mode ?? ""),
    busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
    foreignKeysOn: Number(fkRow[0]?.foreign_keys ?? 0) === 1,
  };
}

export function isSqliteLockError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("database is locked") ||
    msg.includes("SQLITE_BUSY") ||
    msg.includes("Unable to open the database file")
  );
}
