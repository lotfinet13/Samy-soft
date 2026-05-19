import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { IPC_CHANNELS } from "../../shared/ipc-channels";
import { APP_SETTING_KEYS } from "../../shared/settings-keys";

export const E2E_ADMIN_PASSWORD = "E2E_Admin_Stable_12!";

export async function ipcInvoke<T>(page: Page, channel: string, payload?: unknown): Promise<T> {
  return page.evaluate(
    async ({ ch, pl }) => {
      if (!window.samy?.invoke) throw new Error("Bridge IPC indisponible.");
      return window.samy.invoke(ch, pl);
    },
    { ch: channel, pl: payload },
  ) as Promise<T>;
}

export async function ensureLoggedIn(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.samy?.invoke), undefined, { timeout: 120_000 });

  const session = await ipcInvoke<{ user?: { username: string } | null }>(page, IPC_CHANNELS.AUTH_SESSION);
  if (session?.user?.username) {
    await dismissOnboardingWizard(page);
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, "#/");
    return;
  }

  await ipcInvoke(page, IPC_CHANNELS.AUTH_LOGOUT);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => (document.getElementById("root")?.childElementCount ?? 0) > 0, [], {
    timeout: 120_000,
  });

  const loginForm = page.locator('[data-testid="login-form"]');
  await expect(loginForm).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-testid="login-username"]').fill("admin");
  await page.locator('[data-testid="login-password"]').fill(E2E_ADMIN_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await expect(loginForm).toBeHidden({ timeout: 60_000 });

  await dismissOnboardingWizard(page);

  const sessionAfter = await ipcInvoke<{ user?: { username: string } | null }>(page, IPC_CHANNELS.AUTH_SESSION);
  if (!sessionAfter?.user?.username) {
    throw new Error("Session E2E absente après connexion admin.");
  }
}

async function dismissOnboardingWizard(page: Page): Promise<void> {
  const session = await ipcInvoke<{ user?: { username: string } | null }>(page, IPC_CHANNELS.AUTH_SESSION);
  if (!session?.user) return;

  await ipcInvoke(page, IPC_CHANNELS.SETTINGS_UPSERT, {
    [APP_SETTING_KEYS.ONBOARDING_WIZARD_DONE]: "true",
  }).catch(() => undefined);

  const wizard = page.locator('[data-testid="onboarding-wizard"]');
  if (await wizard.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /Terminer|Suivant|Ignorer/i }).last().click({ timeout: 5_000 }).catch(() => undefined);
    await ipcInvoke(page, IPC_CHANNELS.SETTINGS_UPSERT, {
      [APP_SETTING_KEYS.ONBOARDING_WIZARD_DONE]: "true",
    }).catch(() => undefined);
  }
  await expect(wizard).toHaveCount(0, { timeout: 30_000 });
}

export async function reloadAppShell(page: Page): Promise<void> {
  await page.reload({ waitUntil: "load" });
  await ensureLoggedIn(page);
}
