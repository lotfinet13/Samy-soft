/**
 * UI modal workflows — open, validation, save, loading, toast, close, table refresh, persistence.
 */
import { expect, test } from "@playwright/test";

import { ensureLoggedIn } from "./helpers/app";
import { launchSamyElectron } from "./helpers/electron-launch";
import { E2E } from "./helpers/fixtures-data";
import { expectModalClosed, expectModalOpen, expectToast, gotoHash } from "./helpers/ui";

test.describe.configure({ mode: "serial" });

let electronApp: Awaited<ReturnType<typeof launchSamyElectron>>;

test.beforeAll(async () => {
  electronApp = await launchSamyElectron();
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.beforeEach(async () => {
  const page = await electronApp.firstWindow();
  await ensureLoggedIn(page);
});

test.describe("Supplier modal", () => {
  const name = `E2E-UI-SUP-${Date.now()}`;

  test("validation, save, toast, close, table refresh, stale reset, escape", async () => {
    const page = await electronApp.firstWindow({ timeout: 120_000 });
    await ensureLoggedIn(page);
    await gotoHash(page, "/inventaire/fournisseurs");
    await expect(page.getByRole("heading", { name: "Fournisseurs" })).toBeVisible({ timeout: 60_000 });

    await page.locator('[data-testid="supplier-modal-open"]').click();
    await expectModalOpen(page, "supplier-modal");

    await page.locator('[data-testid="supplier-modal-submit"]').click();
    await expect(page.locator('[data-testid="supplier-modal"]')).toBeVisible();

    await page.locator('[data-testid="supplier-modal-name"]').fill(name);
    await page.locator('[data-testid="supplier-modal-submit"]').click();
    await expect(page.locator('[data-testid="supplier-modal-submit"]')).toBeDisabled();
    await expectToast(page, "success", "Fournisseur créé");
    await expectModalClosed(page, "supplier-modal");

    await expect(page.locator("table").getByText(name, { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.locator('[data-testid="supplier-modal-open"]').click();
    await expectModalOpen(page, "supplier-modal");
    await expect(page.locator('[data-testid="supplier-modal-name"]')).toHaveValue("");

    await page.keyboard.press("Escape");
    await expectModalClosed(page, "supplier-modal");
  });

  test("persistence after navigation", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/");
    await gotoHash(page, "/inventaire/fournisseurs");
    await page.locator('[data-testid="supplier-list-search"]').fill(name);
    await page.keyboard.press("Enter");
    await expect(page.locator("table").getByText(name, { exact: true })).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("Material modal", () => {
  const sku = `E2E-UI-RAW-${Date.now()}`;

  test("create raw material via modal", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/inventaire/matières");
    await expect(page.getByRole("heading", { name: /Matières premières/ })).toBeVisible({ timeout: 60_000 });

    await page.locator('[data-testid="material-modal-open"]').click();
    await expectModalOpen(page, "material-modal");

    await page.locator('[data-testid="material-modal-submit"]').click();
    await expect(page.locator('[data-testid="material-modal"]')).toBeVisible();

    await page.locator('[data-testid="material-modal-sku"]').fill(sku);
    await page.locator('[data-testid="material-modal-label"]').fill("MP E2E UI");
    await page.locator('[data-testid="material-modal-submit"]').click();
    await expectToast(page, "success");
    await expectModalClosed(page, "material-modal");
    await expect(page.locator("table").getByText(sku, { exact: true })).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("Invoice modal", () => {
  test("picker load, validation, draft create, navigation", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/ventes/factures");
    await expect(page.getByRole("heading", { name: /^Factures$/ })).toBeVisible({ timeout: 60_000 });

    await page.locator('[data-testid="invoice-modal-open"]').click();
    await expectModalOpen(page, "invoice-modal");
    await expect(page.locator('[data-testid="invoice-modal-picker-loading"]')).toBeHidden({ timeout: 60_000 });

    const customerSelect = page.locator('[data-testid="invoice-modal-customer"]');
    await expect(customerSelect.locator("option", { hasText: E2E.customerCode })).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(page.locator('[data-testid="invoice-modal-submit"]')).toBeDisabled();

    const customerValue = await customerSelect
      .locator("option", { hasText: E2E.customerCode })
      .getAttribute("value");
    expect(customerValue).toBeTruthy();
    await customerSelect.selectOption(customerValue!);
    await expect(page.locator('[data-testid="invoice-modal-submit"]')).toBeEnabled();
    await page.locator('[data-testid="invoice-modal-submit"]').click();
    await expect(page.locator('[data-testid="invoice-modal-submit"]')).toBeDisabled();
    await expectToast(page, "success", "Brouillon");
    await expectModalClosed(page, "invoice-modal");
    await expect(page).toHaveURL(/#\/ventes\/factures\//, { timeout: 30_000 });
  });
});

test.describe("Production batch modal", () => {
  test("recipe dropdown, validation, create batch", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/production/lots");
    await expect(page.getByRole("heading", { name: /Suivi des lots/ })).toBeVisible({ timeout: 60_000 });

    await page.locator('[data-testid="batch-modal-open"]').click();
    await expectModalOpen(page, "batch-modal");

    await expect(page.locator('[data-testid="batch-modal-recipe"] option')).not.toHaveCount(1, { timeout: 60_000 });
    await expect(page.locator('[data-testid="batch-modal-submit"]')).toBeDisabled();

    const recipeSelect = page.locator('[data-testid="batch-modal-recipe"]');
    const recipeValue = await recipeSelect.locator("option", { hasText: E2E.recipeCode }).first().getAttribute("value");
    expect(recipeValue).toBeTruthy();
    await recipeSelect.selectOption(recipeValue!);
    await page.locator('[data-testid="batch-modal-submit"]').click();
    await expect(page.locator('[data-testid="batch-modal-submit"]')).toBeDisabled();
    await expectToast(page, "success", "Lot programmé");
    await expectModalClosed(page, "batch-modal");

    await page.keyboard.press("Escape");
    await expectModalClosed(page, "batch-modal");
  });
});

test.describe("Purchase form panel", () => {
  test("validation error, successful purchase, journal refresh", async () => {
    const page = await electronApp.firstWindow();
    await ensureLoggedIn(page);
    await gotoHash(page, "/inventaire/achats");
    await expect(page.getByRole("heading", { name: /Réceptions acheteurs/ })).toBeVisible({ timeout: 60_000 });

    const form = page.locator('[data-testid="purchase-modal-form"]');
    await expect(form).toBeVisible();

    const supplierSelect = page.locator('[data-testid="purchase-modal-supplier"]');
    await page.locator('[data-testid="purchase-modal-submit"]').click();
    const supplierInvalid = await supplierSelect.evaluate((el) => !(el as HTMLSelectElement).checkValidity());
    expect(supplierInvalid).toBe(true);

    const supplierValue = await supplierSelect
      .locator("option", { hasText: E2E.supplierName })
      .getAttribute("value");
    expect(supplierValue).toBeTruthy();
    await supplierSelect.selectOption(supplierValue!);

    const materialSelect = page.locator('[data-testid="purchase-modal-line-material"]');
    const materialValue = await materialSelect.locator("option", { hasText: E2E.rawSku }).getAttribute("value");
    expect(materialValue).toBeTruthy();
    await materialSelect.selectOption(materialValue!);

    await page.locator('[data-testid="purchase-modal-submit"]').click();
    await expect(page.locator('[data-testid="purchase-modal-submit"]')).toBeDisabled();
    await expectToast(page, "success", "Bon d'achat");
    await expect(page.locator('[data-testid="purchase-modal-error"]')).toHaveCount(0);
  });
});
