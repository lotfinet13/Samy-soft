import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { APP_SETTING_KEYS } from "../../shared/settings-keys.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const dbPath = path.join(os.tmpdir(), `samy-settings-${Date.now()}.sqlite`);

describe("ensureDefaultSettings", { hookTimeout: 120_000 }, () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const url = `file:${dbPath.replace(/\\/g, "/")}`;
    execSync("npx prisma db push --skip-generate", {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* noop */
    }
  });

  it("does not overwrite an existing factory name on second call", async () => {
    const { ensureDefaultSettings } = await import("../../electron/services/settings-service.ts");
    await ensureDefaultSettings(prisma);
    const marker = "Usine Pilote Test 42";
    await prisma.appSetting.update({
      where: { key: APP_SETTING_KEYS.FACTORY_NAME },
      data: { value: marker },
    });
    await ensureDefaultSettings(prisma);
    const row = await prisma.appSetting.findUnique({
      where: { key: APP_SETTING_KEYS.FACTORY_NAME },
    });
    expect(row?.value).toBe(marker);
  });
});
