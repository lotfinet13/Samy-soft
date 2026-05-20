/**
 * Startup health + SQLite pragma assertions + cold restart after backup export.
 */
import { expect, test } from "@playwright/test";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import { ensureLoggedIn, ipcInvoke } from "./helpers/app";
import { launchSamyElectron } from "./helpers/electron-launch";

test.describe.configure({ mode: "serial" });

test("startup diagnostics include health and sqlite pragmas", async () => {
  const app = await launchSamyElectron();
  const page = await app.firstWindow({ timeout: 120_000 });
  try {
    await ensureLoggedIn(page);
    const diag = await ipcInvoke<{
      ok: boolean;
      sqlite: { journalMode: string; busyTimeoutMs: number; foreignKeysOn: boolean };
      health: { integrity: { ok: boolean }; writablePaths: { backupDirOk: boolean } };
    }>(page, IPC_CHANNELS.SYSTEM_STARTUP_DIAGNOSTICS);

    expect(diag.health.integrity.ok).toBe(true);
    expect(diag.health.writablePaths.backupDirOk).toBe(true);
    expect(String(diag.sqlite.journalMode).toLowerCase()).toContain("wal");
    expect(diag.sqlite.busyTimeoutMs).toBeGreaterThanOrEqual(15_000);
    expect(diag.sqlite.foreignKeysOn).toBe(true);
  } finally {
    await app.close();
  }
});

test("cold restart after backup export preserves integrity", async () => {
  const app = await launchSamyElectron();
  const page = await app.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page);

  const exported = await ipcInvoke<{ recordId: string; absolutePath: string }>(
    page,
    IPC_CHANNELS.BACKUP_EXPORT,
  );
  expect(exported.recordId).toBeTruthy();

  const verified = await ipcInvoke<{ ok: boolean }>(page, IPC_CHANNELS.BACKUP_VERIFY, {
    backupId: exported.recordId,
  });
  expect(verified.ok).toBe(true);

  await app.close();

  const app2 = await launchSamyElectron();
  const page2 = await app2.firstWindow({ timeout: 120_000 });
  try {
    await ensureLoggedIn(page2);
    const diag = await ipcInvoke<{ ok: boolean; health: { integrity: { ok: boolean } } }>(
      page2,
      IPC_CHANNELS.SYSTEM_STARTUP_DIAGNOSTICS,
    );
    expect(diag.health.integrity.ok).toBe(true);
  } finally {
    await app2.close();
  }
});
