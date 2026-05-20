import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const ROOT = path.resolve(import.meta.dirname, "../..");
const dbPath = path.join(os.tmpdir(), `samy-logout-${Date.now()}.sqlite`);

describe("performLogout integration (SQLite)", { hookTimeout: 120_000 }, () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const url = `file:${dbPath.replace(/\\/g, "/")}`;
    execSync("npx prisma db push --skip-generate", {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    process.env.SAMY_TEST_DATABASE_PATH = dbPath;
    process.env.DATABASE_URL = url;

    const { resetSessionStoreCacheForTests } = await import(
      "../../electron/services/auth-service.ts"
    );
    resetSessionStoreCacheForTests();

    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();

    const { ensureDefaultRoles } = await import("../../electron/services/auth-service.ts");
    const adminRoleId = await ensureDefaultRoles(prisma);
    await prisma.user.create({
      data: {
        username: "logout_test",
        passwordHash: "x",
        displayName: "Logout Test",
        roleId: adminRoleId,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* noop */
    }
  });

  it("logs LOGOUT and clears session for valid user", async () => {
    const { persistSession, performLogout, readSession, resetSessionStoreCacheForTests } =
      await import("../../electron/services/auth-service.ts");
    resetSessionStoreCacheForTests();

    const user = await prisma.user.findUniqueOrThrow({ where: { username: "logout_test" } });
    persistSession({ userId: user.id });

    await performLogout(prisma);
    expect(readSession()).toBeNull();

    const row = await prisma.activityLog.findFirst({
      where: { action: "LOGOUT" },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.userId).toBe(user.id);
  });

  it("does not throw FK error for stale session userId", async () => {
    const { persistSession, performLogout, resetSessionStoreCacheForTests } = await import(
      "../../electron/services/auth-service.ts"
    );
    resetSessionStoreCacheForTests();

    persistSession({ userId: "00000000-0000-0000-0000-000000000099" });
    await expect(performLogout(prisma)).resolves.toEqual({ ok: true });

    const row = await prisma.activityLog.findFirst({
      where: { action: "LOGOUT_ORPHAN" },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.userId).toBeNull();
    expect(JSON.parse(row?.metadata ?? "{}")).toMatchObject({
      previousUserId: "00000000-0000-0000-0000-000000000099",
    });
  });

  it("reconcileStaleSessionAtStartup clears orphan without FK error", async () => {
    const {
      persistSession,
      readSession,
      reconcileStaleSessionAtStartup,
      resetSessionStoreCacheForTests,
    } = await import("../../electron/services/auth-service.ts");
    resetSessionStoreCacheForTests();

    persistSession({ userId: "00000000-0000-0000-0000-000000000088" });
    await expect(reconcileStaleSessionAtStartup(prisma)).resolves.toBeUndefined();
    expect(readSession()).toBeNull();

    const row = await prisma.activityLog.findFirst({
      where: { action: "SESSION_INVALIDATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.userId).toBeNull();
  });
});
