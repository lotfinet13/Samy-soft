/**
 * One-shot packaged app probe for Production Packaging Validation Phase.
 * Usage: npx tsx scripts/packaged-validation-probe.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron } from "@playwright/test";

import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import { APP_SETTING_KEYS } from "../shared/settings-keys.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXE =
  process.env.SAMY_PACKAGED_EXE?.trim() ||
  path.join(ROOT, "release", "win-unpacked", "SAMY SOFT.exe");
const OUT = path.join(ROOT, ".data", "packaged-validation-probe.json");

const E2E_ADMIN_PASSWORD = "Packaged_Validation_12!";

type ProbeResult = {
  timestamp: string;
  exeExists: boolean;
  launchMs: number | null;
  preloadOk: boolean;
  preloadViaContextBridge: boolean;
  ipcSmokeOk: boolean;
  ipcSmokeDetail: unknown;
  securityRelaxIgnored: boolean;
  hasGlobalSamyUnderE2E: boolean;
  dbPathFromIpc: string | null;
  bootstrapTablesOk: boolean | null;
  startupDiagnosticsOk: boolean | null;
  bootstrapFileExists: boolean | null;
  migrationsOk: boolean | null;
  migrationsPendingCount: number | null;
  backupExportOk: boolean | null;
  backupExportError: string | null;
  backupExportPath: string | null;
  restartPersistenceOk: boolean | null;
  sessionRestoreOk: boolean | null;
  productionSmokeHidesDbPath: boolean | null;
  errors: string[];
  userDataGuess: string;
};

async function main(): Promise<void> {
  const result: ProbeResult = {
    timestamp: new Date().toISOString(),
    exeExists: fs.existsSync(EXE),
    launchMs: null,
    preloadOk: false,
    preloadViaContextBridge: false,
    ipcSmokeOk: false,
    ipcSmokeDetail: null,
    securityRelaxIgnored: false,
    hasGlobalSamyUnderE2E: false,
    dbPathFromIpc: null,
    bootstrapTablesOk: null,
    startupDiagnosticsOk: null,
    bootstrapFileExists: null,
    migrationsOk: null,
    migrationsPendingCount: null,
    backupExportOk: null,
    backupExportError: null,
    restartPersistenceOk: null,
    sessionRestoreOk: null,
    productionSmokeHidesDbPath: null,
    backupExportPath: null,
    errors: [],
    userDataGuess: path.join(os.homedir(), "AppData", "Roaming", "samy-soft"),
  };

  if (!result.exeExists) {
    result.errors.push(`Missing executable: ${EXE}`);
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
    console.error(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const t0 = Date.now();
  let app: Awaited<ReturnType<typeof electron.launch>> | null = null;

  try {
    app = await electron.launch({
      executablePath: EXE,
      env: {
        ...process.env,
        SAMY_E2E: "1",
        SAMY_SKIP_DEVTOOLS: "1",
      },
    });
    result.launchMs = Date.now() - t0;

    const page = await app.firstWindow({ timeout: 120_000 });
    page.on("pageerror", (err) => result.errors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") result.errors.push(`console.error: ${msg.text()}`);
    });

    await page.waitForLoadState("domcontentloaded", { timeout: 120_000 });

    result.hasGlobalSamyUnderE2E = await page.evaluate(() => {
      const g = globalThis as { samy?: unknown };
      return Boolean(g.samy);
    });

    await page.waitForFunction(() => {
      const w = globalThis as unknown as { samy?: { invoke?: unknown } };
      return Boolean(w.samy && typeof w.samy.invoke === "function");
    }, { timeout: 120_000 });

    result.preloadOk = true;
    result.preloadViaContextBridge = await page.evaluate(() => {
      return typeof (globalThis as { __SAMY_PRELOAD_LOADED_AT__?: string }).__SAMY_PRELOAD_LOADED_AT__ === "string";
    });

    const smoke = await page.evaluate(async (channel: string) => {
      return window.samy.invoke(channel);
    }, IPC_CHANNELS.SYSTEM_SMOKE_MAIN_SELFTEST);
    result.ipcSmokeDetail = smoke;
    result.ipcSmokeOk = Boolean((smoke as { ok?: boolean }).ok);

    result.dbPathFromIpc =
      typeof (smoke as { databaseFilePath?: string })?.databaseFilePath === "string"
        ? (smoke as { databaseFilePath: string }).databaseFilePath
        : null;

    const diag = await page.evaluate(async (channel: string) => {
      return window.samy.invoke(channel);
    }, IPC_CHANNELS.SYSTEM_STARTUP_DIAGNOSTICS);
    const bootstrap = (diag as { bootstrapSchema?: { driftDetected?: boolean; fileExists?: boolean } })
      ?.bootstrapSchema;
    const migrations = (diag as { migrations?: { ok?: boolean; pendingCount?: number } })?.migrations;
    result.bootstrapTablesOk = bootstrap ? bootstrap.driftDetected === false : null;
    result.startupDiagnosticsOk = Boolean((diag as { ok?: boolean }).ok);
    result.bootstrapFileExists = bootstrap?.fileExists === true;
    result.migrationsOk = migrations?.ok === true;
    result.migrationsPendingCount = migrations?.pendingCount ?? null;

    result.securityRelaxIgnored = result.preloadViaContextBridge && !result.hasGlobalSamyUnderE2E;

    await page.waitForFunction(
      () => (document.getElementById("root")?.childElementCount ?? 0) > 0,
      { timeout: 120_000 },
    );

    await page.evaluate(
      async (args: { chStatus: string; chCreate: string; pwd: string }) => {
        const status = (await window.samy.invoke(args.chStatus)) as { state: string };
        if (status.state === "needs_setup") {
          await window.samy.invoke(args.chCreate, {
            username: "packaged_admin",
            password: args.pwd,
            displayName: "Packaged Validation",
          });
        }
      },
      {
        chStatus: IPC_CHANNELS.BOOTSTRAP_STATUS,
        chCreate: IPC_CHANNELS.BOOTSTRAP_CREATE_ADMIN,
        pwd: E2E_ADMIN_PASSWORD,
      },
    );

    await page.evaluate(
      async ([chLogin, user, pwd]: [string, string, string]) => {
        const res = (await window.samy.invoke(chLogin, { username: user, password: pwd })) as {
          ok?: boolean;
        };
        if (!res.ok) throw new Error("AUTH_LOGIN failed");
      },
      [IPC_CHANNELS.AUTH_LOGIN, "packaged_admin", E2E_ADMIN_PASSWORD],
    );

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => {
      const w = globalThis as unknown as { samy?: { invoke?: unknown } };
      return Boolean(w.samy?.invoke);
    });

    const session = await page.evaluate(async (ch: string) => window.samy.invoke(ch), IPC_CHANNELS.AUTH_SESSION);
    result.sessionRestoreOk = Boolean((session as { ok?: boolean }).ok);

    const marker = `packaged-validation-${Date.now()}`;
    await page.evaluate(
      async ([channel, key, value]: [string, string, string]) => {
        await window.samy.invoke(channel, { [key]: value });
      },
      [IPC_CHANNELS.SETTINGS_UPSERT, APP_SETTING_KEYS.FACTORY_NAME, marker],
    );

    try {
      const backup = await page.evaluate(async (channel: string) => {
        return window.samy.invoke(channel);
      }, IPC_CHANNELS.BACKUP_EXPORT);
      result.backupExportOk = Boolean((backup as { recordId?: string }).recordId);
      result.backupExportPath =
        typeof (backup as { absolutePath?: string })?.absolutePath === "string"
          ? (backup as { absolutePath: string }).absolutePath
          : null;
    } catch (e) {
      result.backupExportOk = false;
      result.backupExportError = e instanceof Error ? e.message : String(e);
    }

    const prodSmoke = await page.evaluate(async (channel: string) => window.samy.invoke(channel), IPC_CHANNELS.SYSTEM_SMOKE_MAIN_SELFTEST);
    result.productionSmokeHidesDbPath = !("databaseFilePath" in (prodSmoke as object));

    await app.close();
    app = null;

    const t1 = Date.now();
    const app2 = await electron.launch({
      executablePath: EXE,
      env: { ...process.env, SAMY_SKIP_DEVTOOLS: "1" },
    });
    const page2 = await app2.firstWindow({ timeout: 120_000 });
    await page2.waitForLoadState("domcontentloaded");
    await page2.waitForFunction(() => {
      const w = globalThis as unknown as { samy?: { invoke?: unknown } };
      return Boolean(w.samy?.invoke);
    });
    let session2 = await page2.evaluate(async (ch: string) => window.samy.invoke(ch), IPC_CHANNELS.AUTH_SESSION);
    if (!(session2 as { ok?: boolean }).ok) {
      await page2.evaluate(
        async ([chLogin, user, pwd]: [string, string, string]) => {
          const res = (await window.samy.invoke(chLogin, { username: user, password: pwd })) as {
            ok?: boolean;
          };
          if (!res.ok) throw new Error("AUTH_LOGIN failed on restart pass");
        },
        [IPC_CHANNELS.AUTH_LOGIN, "packaged_admin", E2E_ADMIN_PASSWORD],
      );
      session2 = await page2.evaluate(async (ch: string) => window.samy.invoke(ch), IPC_CHANNELS.AUTH_SESSION);
    }
    result.sessionRestoreOk = result.sessionRestoreOk && Boolean((session2 as { ok?: boolean }).ok);

    const persisted = await page2.evaluate(
      async ([channel, key, expected]: [string, string, string]) => {
        const settings = (await window.samy.invoke(channel)) as Record<string, string>;
        return settings[key] === expected;
      },
      [IPC_CHANNELS.SETTINGS_GET_ALL, APP_SETTING_KEYS.FACTORY_NAME, marker],
    );
    result.restartPersistenceOk = persisted;
    result.launchMs = (result.launchMs ?? 0) + (Date.now() - t1);
    await app2.close();
  } catch (e) {
    result.errors.push(e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    if (app) await app.close().catch(() => undefined);
  }

  if (result.dbPathFromIpc && fs.existsSync(result.dbPathFromIpc)) {
    const stat = fs.statSync(result.dbPathFromIpc);
    (result as { dbFileBytes?: number }).dbFileBytes = stat.size;
  }

  const userDb = path.join(result.userDataGuess, "samy-soft.sqlite");
  (result as { userDataSqliteExists?: boolean }).userDataSqliteExists = fs.existsSync(userDb);

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.errors.length > 0 || !result.preloadOk || !result.ipcSmokeOk ? 1 : 0);
}

void main();
