/**
 * Backup ZIP export → verify → restore → cold restart → fixture persistence.
 * Uses isolated E2E database; restore replaces the live SQLite file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import { ensureLoggedIn, ipcInvoke } from "./helpers/app";
import { launchSamyElectron } from "./helpers/electron-launch";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test.describe.configure({ mode: "serial" });

test("backup export, verify, restore, and restart preserves fixtures", async () => {
  const electronApp = await launchSamyElectron();
  const page = await electronApp.firstWindow();
  await ensureLoggedIn(page);

  const suppliersBefore = await ipcInvoke<{ items: Array<{ id: string; name: string }> }>(
    page,
    IPC_CHANNELS.INVENTORY_SUPPLIER_LIST,
    { take: 50 },
  );
  expect(suppliersBefore.items.length).toBeGreaterThanOrEqual(1);
  const markerName = suppliersBefore.items[0]?.name;
  expect(markerName).toBeTruthy();

  const exported = await ipcInvoke<{ recordId: string; absolutePath: string }>(page, IPC_CHANNELS.BACKUP_EXPORT);
  expect(exported.recordId).toBeTruthy();
  expect(fs.existsSync(exported.absolutePath)).toBe(true);

  const verified = await ipcInvoke<{ ok: boolean }>(page, IPC_CHANNELS.BACKUP_VERIFY, {
    backupId: exported.recordId,
  });
  expect(verified.ok).toBe(true);

  await electronApp.close();

  const relaunch = await launchSamyElectron();
  const page2 = await relaunch.firstWindow();
  await ensureLoggedIn(page2);

  await ipcInvoke(page2, IPC_CHANNELS.BACKUP_RESTORE, { backupId: exported.recordId });

  await relaunch.close();

  const afterRestore = await launchSamyElectron();
  const page3 = await afterRestore.firstWindow();
  await ensureLoggedIn(page3);

  const suppliersAfter = await ipcInvoke<{ items: Array<{ name: string }> }>(
    page3,
    IPC_CHANNELS.INVENTORY_SUPPLIER_LIST,
    { take: 50 },
  );
  expect(suppliersAfter.items.some((s) => s.name === markerName)).toBe(true);

  const diag = await ipcInvoke<{ ok: boolean; migrations: { ok: boolean } }>(
    page3,
    IPC_CHANNELS.SYSTEM_STARTUP_DIAGNOSTICS,
  );
  expect(diag.migrations.ok).toBe(true);

  await afterRestore.close();
});
