import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function gotoHash(page: Page, route: string): Promise<void> {
  const hash = route.startsWith("#") ? route : `#${route.startsWith("/") ? route : `/${route}`}`;
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
}

export async function expectToast(page: Page, tone: "success" | "error", messagePart?: string | RegExp): Promise<void> {
  const toast = page.locator(`[data-testid="toast-${tone}"]`).last();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  if (messagePart) {
    if (typeof messagePart === "string") {
      await expect(toast).toContainText(messagePart);
    } else {
      await expect(toast).toHaveAttribute("data-toast-message", messagePart);
    }
  }
}

export async function expectModalClosed(page: Page, testId: string): Promise<void> {
  await expect(page.locator(`[data-testid="${testId}"]`)).toHaveCount(0, { timeout: 15_000 });
}

export async function expectModalOpen(page: Page, testId: string): Promise<void> {
  await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible({ timeout: 30_000 });
}
