/**
 * Auth session lifecycle — logout audit, repeated login/logout, restart persistence.
 */
import { expect, test, _electron as electron } from "@playwright/test";
import electronPath from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import { E2E_ADMIN_PASSWORD, ensureLoggedIn, ipcInvoke } from "./helpers/app";
import { E2E_LAUNCH_ENV, E2E_ROOT, launchSamyElectron } from "./helpers/electron-launch";

test.describe.configure({ mode: "serial" });

test("A1 — repeated login/logout cycles without IPC errors", async () => {
  const app = await launchSamyElectron();
  const page = await app.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page);

  for (let i = 0; i < 3; i++) {
    await ipcInvoke(page, IPC_CHANNELS.AUTH_LOGOUT);
    await page.reload({ waitUntil: "load" });
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible({ timeout: 60_000 });
    await page.locator('[data-testid="login-username"]').fill("admin");
    await page.locator('[data-testid="login-password"]').fill(E2E_ADMIN_PASSWORD);
    await page.locator('[data-testid="login-submit"]').click();
    await expect(page.locator('[data-testid="login-form"]')).toBeHidden({ timeout: 60_000 });
  }

  const session = await ipcInvoke<{ ok: boolean }>(page, IPC_CHANNELS.AUTH_SESSION);
  expect(session.ok).toBe(true);
  await app.close();
});

test("A2 — logout with no session is idempotent", async () => {
  const app = await launchSamyElectron();
  const page = await app.firstWindow({ timeout: 120_000 });
  await ipcInvoke(page, IPC_CHANNELS.AUTH_LOGOUT);
  await ipcInvoke(page, IPC_CHANNELS.AUTH_LOGOUT);
  const session = await ipcInvoke<{ ok: boolean }>(page, IPC_CHANNELS.AUTH_SESSION);
  expect(session.ok).toBe(false);
  await app.close();
});

test("A3 — session survives cold relaunch (electron-store + E2E DB scope)", async () => {
  const app1 = await launchSamyElectron();
  const page1 = await app1.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page1);
  await app1.close();

  const app2 = await electron.launch({
    cwd: E2E_ROOT,
    args: [".", "--samy-e2e"],
    executablePath: electronPath,
    env: { ...process.env, ...E2E_LAUNCH_ENV },
  });
  const page2 = await app2.firstWindow({ timeout: 120_000 });
  await page2.waitForFunction(() => Boolean(window.samy?.invoke), undefined, { timeout: 120_000 });

  const session = await ipcInvoke<{ ok: boolean; user?: { username: string } }>(
    page2,
    IPC_CHANNELS.AUTH_SESSION,
  );
  expect(session.ok).toBe(true);
  expect(session.user?.username).toBe("admin");
  await app2.close();
});
