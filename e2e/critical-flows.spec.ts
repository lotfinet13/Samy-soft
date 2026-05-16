/**
 * Flux critiques Phase 11 — base isolée `.data/e2e/samye2e.sqlite`.
 * `npm run e2e` exécute **`e2e:ensure-db`** (push + seed + fixtures) avant Playwright.
 * Rebuild complet renderer/electron : **`npm run e2e:prepare`**.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electronPath from "electron";
import { expect, test, _electron as electron } from "@playwright/test";

import { IPC_CHANNELS } from "../shared/ipc-channels";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = path.join(ROOT, "e2e", "artifacts");

const E2E_ADMIN_PASSWORD = "E2E_Admin_Stable_12!";

test.describe.configure({ mode: "serial" });

let electronApp: Awaited<ReturnType<typeof electron.launch>>;

test.beforeAll(async () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  electronApp = await electron.launch({
    cwd: ROOT,
    args: [".", "--samy-e2e"],
    executablePath: electronPath,
    env: {
      ...process.env,
      NODE_ENV: "test",
      SAMY_E2E: "1",
      SAMY_SKIP_DEVTOOLS: "1",
      SAMY_E2E_DATABASE_PATH: path.join(ROOT, ".data", "e2e", "samye2e.sqlite"),
    },
  });
  const bootPage = await electronApp.firstWindow({ timeout: 120_000 });
  bootPage.on("pageerror", (err) => console.log("[e2e][renderer-pageerror]", err.message));
});

test.afterAll(async () => {
  await electronApp.close();
});

test("smoke: Electron démarre, preload présent", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });
  await page.waitForLoadState("domcontentloaded");

  await page.waitForFunction(() => {
    const w = globalThis as unknown as { samy?: { invoke?: unknown } };
    return Boolean(w.samy && typeof w.samy.invoke === "function");
  });

  await page.waitForFunction(() => {
    const w = globalThis as unknown as { __SAMY_PRELOAD_LOADED_AT__?: string };
    return typeof w.__SAMY_PRELOAD_LOADED_AT__ === "string" && w.__SAMY_PRELOAD_LOADED_AT__.length > 8;
  });

  const st = await page.evaluate(async (channel: string) => {
    return window.samy.invoke(channel);
  }, IPC_CHANNELS.SYSTEM_SMOKE_MAIN_SELFTEST);

  expect((st as { ok?: boolean }).ok).toBe(true);
});

test("parcours connexion tableau de bord", async () => {
  const page = await electronApp.firstWindow();
  await page.waitForLoadState("load");
  await page.waitForFunction(
    () => (document.getElementById("root")?.childElementCount ?? 0) > 0,
    [],
    { timeout: 120_000 },
  );

  /** Déconnexion côté processus principal puis rechargement pour resynchroniser le store renderer. */
  await page.evaluate(async (channel: string) => {
    await window.samy.invoke(channel);
  }, IPC_CHANNELS.AUTH_LOGOUT);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(
    () => (document.getElementById("root")?.childElementCount ?? 0) > 0,
    [],
    { timeout: 120_000 },
  );

  await expect(page.locator('[data-testid="login-form"]')).toBeVisible({ timeout: 120_000 });

  const userField = page.locator('[data-testid="login-username"]');
  const passField = page.locator('[data-testid="login-password"]');
  await userField.fill("admin");
  await passField.fill(E2E_ADMIN_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();

  await expect(page.locator('[data-testid="login-form"]')).toBeHidden({ timeout: 60_000 });
  await expect(
    page.getByRole("heading", { level: 1, name: "Centre des opérations" }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-testid="dashboard-page"]')).toBeVisible({ timeout: 30_000 });

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "dashboard.png"),
    fullPage: true,
  });
});

test("navigation modules clés + IPC backup & intégrité", async () => {
  const page = await electronApp.firstWindow();

  async function gotoModule(route: string, headingRx: RegExp): Promise<void> {
    await page.evaluate((hashPath) => {
      window.location.hash = hashPath;
    }, route.startsWith("#") ? route : `#${route}`);

    await expect(page.getByRole("heading", { name: headingRx })).toBeVisible({ timeout: 60_000 });
  }

  await gotoModule("/inventaire/matières", /Matières premières/);
  await gotoModule("/production/lots", /Suivi des lots fabrications/);
  await gotoModule("/ventes/factures", /^Factures$/);
  await gotoModule("/rh/paie/cycles", /Cycles de paie/);

  const backupInvoke = await page.evaluate(async (channel: string) => {
    return window.samy.invoke(channel);
  }, IPC_CHANNELS.BACKUP_EXPORT);
  expect(
    backupInvoke && typeof backupInvoke === "object" && "recordId" in backupInvoke,
  ).toBe(true);

  const integrityInvoke = await page.evaluate(async (channel: string) => {
    return window.samy.invoke(channel);
  }, IPC_CHANNELS.DB_DATA_INTEGRITY_SCAN);
  expect(
    integrityInvoke && typeof integrityInvoke === "object" && "ok" in integrityInvoke,
  ).toBe(true);
});
