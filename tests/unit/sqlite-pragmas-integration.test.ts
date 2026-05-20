import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const ROOT = path.resolve(import.meta.dirname, "../..");
const dbPath = path.join(os.tmpdir(), `samy-pragmas-${Date.now()}.sqlite`);

describe("applySqliteConnectionPragmas integration", { hookTimeout: 120_000 }, () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const url = `file:${dbPath.replace(/\\/g, "/")}`;
    execSync("npx prisma db push --skip-generate", {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();
    const { applySqliteConnectionPragmas } = await import(
      "../../electron/services/sqlite-connection.js"
    );
    await applySqliteConnectionPragmas(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    try {
      fs.unlinkSync(dbPath);
      fs.unlinkSync(`${dbPath}-wal`);
    } catch {
      /* noop */
    }
  });

  it("sets WAL journal mode", async () => {
    const row = await prisma.$queryRawUnsafe<Array<{ journal_mode?: string }>>(
      "PRAGMA journal_mode;",
    );
    expect(String(row[0]?.journal_mode).toLowerCase()).toBe("wal");
  });

  it("sets busy_timeout", async () => {
    const { applySqliteConnectionPragmas, SQLITE_BUSY_TIMEOUT_MS } = await import(
      "../../electron/services/sqlite-connection.js"
    );
    const snap = await applySqliteConnectionPragmas(prisma);
    expect(snap.busyTimeoutMs).toBeGreaterThanOrEqual(SQLITE_BUSY_TIMEOUT_MS);
  });

  it("enables foreign_keys", async () => {
    const row = await prisma.$queryRawUnsafe<Array<{ foreign_keys?: number }>>(
      "PRAGMA foreign_keys;",
    );
    expect(Number(row[0]?.foreign_keys)).toBe(1);
  });
});
