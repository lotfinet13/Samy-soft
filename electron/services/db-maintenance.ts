import fs from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { getDatabaseFilePath } from "../database.js";

export async function prismaIntegritySummary(prisma: PrismaClient): Promise<{
  lines: string[];
  ok: boolean;
}> {
  const rows =
    await prisma.$queryRawUnsafe<Array<{ integrity_check?: string }>>("PRAGMA integrity_check;");
  const lines =
    rows.length > 0
      ? rows.map((r) => String(r?.integrity_check ?? ""))
      : ["(aucun résultat)"];
  const ok =
    rows.length === 1 && typeof rows[0]?.integrity_check === "string"
      ? rows[0]?.integrity_check === "ok"
      : false;
  return { lines, ok };
}

export async function pragmasDiagnostics(prisma: PrismaClient) {
  const pageCountRow = await prisma.$queryRawUnsafe<Array<{ page_count?: number }>>(
    "PRAGMA page_count;",
  );
  const pageSizeRow = await prisma.$queryRawUnsafe<Array<{ page_size?: number }>>(
    "PRAGMA page_size;",
  );
  const freelistRow = await prisma.$queryRawUnsafe<Array<{ freelist_count?: number }>>(
    "PRAGMA freelist_count;",
  );
  const journalRow = await prisma.$queryRawUnsafe<Array<{ journal_mode?: string }>>(
    "PRAGMA journal_mode;",
  );

  const pageCount = Number(pageCountRow[0]?.page_count ?? 0);
  const pageSize = Number(pageSizeRow[0]?.page_size ?? 0);
  const freelist = Number(freelistRow[0]?.freelist_count ?? 0);

  return {
    pageCount,
    pageSize,
    estimatedBytesDb: pageCount * pageSize,
    freelist,
    journalMode: journalRow[0]?.journal_mode ?? "",
  };
}

export async function foreignKeyViolations(prisma: PrismaClient): Promise<Array<Record<string, unknown>>> {
  return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>("PRAGMA foreign_key_check;");
}

export async function migrationsList(prisma: PrismaClient) {
  try {
    return await prisma.$queryRawUnsafe<
      Array<{
        migration_name: string;
        finished_at: string | null;
        rolled_back_at: string | null;
      }>
    >(
      `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 120`,
    );
  } catch {
    return [];
  }
}

export function sqliteFileStats(): {
  absolutePath: string;
  exists: boolean;
  sizeBytes?: number;
} {
  const absolutePath = getDatabaseFilePath();
  try {
    const st = fs.statSync(absolutePath);
    return { absolutePath, exists: true, sizeBytes: Number(st.size) };
  } catch {
    return { absolutePath, exists: false };
  }
}

export async function vacuumDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe("VACUUM;");
}

const COUNT_TABLES = [
  "ActivityLog",
  "Invoice",
  "InventoryMovement",
  "ProductionBatch",
  "BackupRecord",
] as const;

export async function approximateRowCounts(prisma: PrismaClient) {
  const out: Partial<Record<(typeof COUNT_TABLES)[number], number>> = {};
  for (const table of COUNT_TABLES) {
    try {
      const r = await prisma.$queryRawUnsafe<Array<{ c: unknown }>>(
        `SELECT COUNT(*) as c FROM "${table}";`,
      );
      out[table] = Number(r[0]?.c ?? 0);
    } catch {
      /* table absente — ignorer */
    }
  }
  return out;
}
