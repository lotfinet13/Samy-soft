/**
 * Focus retention audit — modals, filters, inline editors, settings, auth.
 */
import { expect, test } from "@playwright/test";

import { ensureLoggedIn } from "./helpers/app";
import { launchSamyElectron } from "./helpers/electron-launch";
import { expectModalOpen, gotoHash } from "./helpers/ui";

test.describe.configure({ mode: "serial" });

let electronApp: Awaited<ReturnType<typeof launchSamyElectron>>;

test.beforeAll(async () => {
  electronApp = await launchSamyElectron();
});

test.afterAll(async () => {
  await electronApp?.close();
});

async function expectStaysFocusedWhileTyping(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator,
  text: string,
): Promise<void> {
  await locator.click();
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 40 });
    await expect
      .poll(async () => locator.evaluate((el) => document.activeElement === el))
      .toBe(true);
  }
}

test.describe("Modal dialogs", () => {
  test("material modal — focus survives validation re-render and typing", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/inventaire/matières");
    await page.locator('[data-testid="material-modal-open"]').click();
    await expectModalOpen(page, "material-modal");

    await page.locator('[data-testid="material-modal-submit"]').click();
    const sku = page.locator('[data-testid="material-modal-sku"]');
    await expect(sku).toBeVisible();
    await expectStaysFocusedWhileTyping(page, sku, "E2E-FOCUS-RAW");

    const label = page.locator('[data-testid="material-modal-label"]');
    await page.keyboard.press("Tab");
    await expect
      .poll(async () => label.evaluate((el) => document.activeElement === el))
      .toBe(true);
    await expectStaysFocusedWhileTyping(page, label, "Focus audit");
  });

  test("supplier modal — focus survives typing and Tab order", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/inventaire/fournisseurs");
    await page.locator('[data-testid="supplier-modal-open"]').click();
    await expectModalOpen(page, "supplier-modal");

    const name = page.locator('[data-testid="supplier-modal-name"]');
    await expectStaysFocusedWhileTyping(page, name, "E2E Focus Supplier");
    await page.keyboard.press("Tab");
    const contact = page.getByLabel("Contact");
    await expect(contact).toBeFocused();
    await expectStaysFocusedWhileTyping(page, contact, "Achraf");
  });

  test("invoice modal — select and inputs keep focus", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/ventes/factures");
    await page.locator('[data-testid="invoice-modal-open"]').click();
    await expectModalOpen(page, "invoice-modal");

    const customer = page.locator('[data-testid="invoice-modal-customer"]');
    await customer.focus();
    await expect(customer).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(customer).toBeFocused();
  });
});

test.describe("Page-level filters and forms", () => {
  test("materials search filter keeps focus while typing", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/inventaire/matières");
    const search = page.getByPlaceholder("SKU / désignation");
    await expectStaysFocusedWhileTyping(page, search, "sucre");
  });

  test("reporting journal date filters keep focus", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/rapports/journal");
    const from = page.locator('input[type="date"]').first();
    await expectStaysFocusedWhileTyping(page, from, "2026");
  });

  test("settings numeric field keeps focus", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/parametres");
    const idle = page.locator('input[inputmode="numeric"]').first();
    await idle.scrollIntoViewIfNeeded();
    await expectStaysFocusedWhileTyping(page, idle, "30");
  });
});

test.describe("Inline table editors", () => {
  test("product price inline editor keeps focus while typing", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/ventes/produits");
    const priceBtn = page.locator('button[title*="F2 modifier prix"]').first();
    await priceBtn.focus();
    await page.keyboard.press("F2");
    const input = page.locator('input[aria-label^="Prix"]').first();
    await expect
      .poll(async () => input.evaluate((el) => document.activeElement === el))
      .toBe(true);
    await expectStaysFocusedWhileTyping(page, input, "99.50");
    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
  });
});

test.describe("Command palette", () => {
  test("filter input keeps focus while typing query", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await page.keyboard.press("Control+k");
    const filter = page.getByRole("dialog", { name: "Navigation et recherche" }).getByLabel("Filtrer la navigation");
    await expect(filter).toBeFocused();
    await expectStaysFocusedWhileTyping(page, filter, "invent");
    await page.keyboard.press("Escape");
    await expect(filter).toHaveCount(0);
  });
});
