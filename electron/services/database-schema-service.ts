import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { getDatabaseFilePath, getPrisma } from "../database.js";
import type { PrismaClient } from "../prisma-client.js";
import { appendSamyMainLog, appendStructuredEvent } from "./logger-service.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const CORE_TABLE = "AppSetting";
let schemaReady = false;
let schemaInitPromise: Promise<void> | null = null;

export function isDatabaseSchemaReady(): boolean {
  return schemaReady;
}

/** Initialise le schéma SQLite avant tout bootstrap / IPC métier (idempotent). */
export async function ensureDatabaseSchemaReady(): Promise<void> {
  if (schemaReady) return;
  if (schemaInitPromise) return schemaInitPromise;

  schemaInitPromise = (async () => {
    const prisma = getPrisma();
    if (await isCoreSchemaPresent(prisma)) {
      schemaReady = true;
      return;
    }

    const hasTables = await hasAnyApplicationTables(prisma);
    if (hasTables) {
      throw new Error(
        "Base locale incomplète ou corrompue. Restaurez une sauvegarde SAMY SOFT ou supprimez le fichier samy-soft.sqlite dans le dossier données de l'application, puis relancez.",
      );
    }

    await applyBootstrapSchema(prisma);
    if (!(await isCoreSchemaPresent(prisma))) {
      throw new Error("Échec d'initialisation du schéma SQLite (table AppSetting absente).");
    }
    schemaReady = true;
    await appendSamyMainLog("Schéma SQLite initialisé automatiquement (premier lancement).", {
      databasePath: getDatabaseFilePath(),
    });
    await appendStructuredEvent("info", {
      scope: "database",
      event: "schema-bootstrap-complete",
      databasePath: getDatabaseFilePath(),
    });
  })().finally(() => {
    schemaInitPromise = null;
  });

  return schemaInitPromise;
}

async function isCoreSchemaPresent(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${CORE_TABLE}' LIMIT 1`,
  );
  return rows.some((row) => row.name === CORE_TABLE);
}

async function hasAnyApplicationTables(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name != '_prisma_migrations'`,
  );
  return rows.length > 0;
}

async function applyBootstrapSchema(prisma: PrismaClient): Promise<void> {
  const sqlPath = resolveBootstrapSchemaSqlPath();
  let sql = fs.readFileSync(sqlPath, "utf8");
  if (sql.charCodeAt(0) === 0xfeff) sql = sql.slice(1);
  const statements = splitSqlStatements(sql);
  if (statements.length === 0) {
    throw new Error(`Script d'initialisation vide : ${sqlPath}`);
  }

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF;");
  try {
    await prisma.$executeRawUnsafe("BEGIN IMMEDIATE;");
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
    await recordBootstrapMigration(prisma, sql);
    await prisma.$executeRawUnsafe("COMMIT;");
  } catch (error) {
    try {
      await prisma.$executeRawUnsafe("ROLLBACK;");
    } catch {
      /* ignore rollback failure */
    }
    throw error;
  } finally {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
  }
}

async function recordBootstrapMigration(prisma: PrismaClient, sql: string): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);
  const checksum = createHash("sha256").update(sql, "utf8").digest("hex");
  const migrationName = "bootstrap-schema";
  const existing = await prisma.$queryRawUnsafe<Array<{ migration_name: string | null }>>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '${migrationName}' LIMIT 1`,
  );
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES ('${id}', '${checksum}', '${now}', '${migrationName}', NULL, NULL, '${now}', 1)`,
  );
}

function resolveBootstrapSchemaSqlPath(): string {
  const candidates = [
    path.join(process.resourcesPath, "prisma", "bootstrap-schema.sql"),
    path.join(process.cwd(), "prisma", "bootstrap-schema.sql"),
    path.join(moduleDir, "..", "..", "..", "prisma", "bootstrap-schema.sql"),
  ];
  if (!app.isPackaged) {
    candidates.unshift(path.join(process.cwd(), "prisma", "bootstrap-schema.sql"));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "Script bootstrap-schema.sql introuvable. Reconstruisez l'application (npm run build / dist:win).",
  );
}

export function splitSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  return withoutComments
    .split(";")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}
