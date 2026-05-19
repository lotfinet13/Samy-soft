/**
 * Cold Electron restart — SQLite persistence, bootstrap safety, no duplicate seed.
 */
import fs from "node:fs";

import { expect, test } from "@playwright/test";

import { ensureLoggedIn, ipcInvoke } from "./helpers/app";
import { E2E_DB_PATH, E2E_LAUNCH_ENV, launchSamyElectron } from "./helpers/electron-launch";
import { E2E } from "./helpers/fixtures-data";
import { gotoHash } from "./helpers/ui";
import { IPC_CHANNELS } from "../shared/ipc-channels";

test.describe.configure({ mode: "serial" });

const marker = `E2E-RESTART-${Date.now()}`;
let supplierId = "";
let rawId = "";
let invoiceId = "";
let batchId = "";

test("R1: create domain data before cold shutdown", async () => {
  const app = await launchSamyElectron();
  const page = await app.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page);

  const diag = await ipcInvoke<{ foreignKeys: { ok: boolean } }>(page, IPC_CHANNELS.SYSTEM_STARTUP_DIAGNOSTICS);
  expect(diag.foreignKeys.ok).toBe(true);
  expect(fs.existsSync(E2E_DB_PATH)).toBe(true);

  const supplier = await ipcInvoke<{ id: string; name: string }>(page, IPC_CHANNELS.INVENTORY_SUPPLIER_UPSERT, {
    name: `${marker}-SUP`,
    isActive: true,
    email: null,
    contactName: null,
    phone: null,
    address: null,
    notes: "restart-e2e",
  });
  supplierId = supplier.id;

  const raw = await ipcInvoke<{ id: string; sku: string }>(page, IPC_CHANNELS.INVENTORY_RAW_UPSERT, {
    sku: `${marker}-RAW`,
    labelFr: "Restart MP",
    unit: "KG",
    minimumStockQty: "1",
    costPriceUnit: "50",
    expirationTracking: false,
    isActive: true,
  });
  rawId = raw.id;

  await ipcInvoke(page, IPC_CHANNELS.INVENTORY_PURCHASE_CREATE, {
    supplierId,
    purchaseDate: new Date().toISOString(),
    currencyCode: "DZD",
    lines: [{ materialKind: "RAW", rawMaterialId: rawId, qty: "3", unitPrice: "100" }],
  });

  const customers = await ipcInvoke<{ items: Array<{ id: string }> }>(page, IPC_CHANNELS.SALES_CUSTOMER_LIST, {
    page: 1,
    pageSize: 5,
    q: E2E.customerCode,
  });
  const products = await ipcInvoke<{ items: Array<{ id: string; sellingPriceSerialized: string }> }>(
    page,
    IPC_CHANNELS.SALES_PRODUCT_LIST,
    { page: 1, pageSize: 5, q: E2E.productSku, includeInactive: true },
  );
  const draft = await ipcInvoke<{ id: string }>(page, IPC_CHANNELS.SALES_INVOICE_CREATE_DRAFT, {
    customerId: customers.items[0]!.id,
    discountAmount: "0",
    lines: [
      {
        productId: products.items[0]!.id,
        labelFr: "restart",
        quantity: "1",
        unitPrice: products.items[0]!.sellingPriceSerialized,
        lineDiscount: "0",
        taxRate: "0",
      },
    ],
  });
  invoiceId = draft.id;

  const recipes = await ipcInvoke<{ items: Array<{ id: string }> }>(page, IPC_CHANNELS.PRODUCTION_RECIPE_LIST, {
    page: 1,
    pageSize: 5,
    q: E2E.recipeCode,
  });
  const batch = await ipcInvoke<{ batchId: string }>(page, IPC_CHANNELS.PRODUCTION_BATCH_CREATE, {
    recipeId: recipes.items[0]!.id,
    plannedQty: "10",
  });
  batchId = batch.batchId;

  const invDash = await ipcInvoke<{ totals: { inventoryValueSerialized: string } }>(
    page,
    IPC_CHANNELS.INVENTORY_DASHBOARD_SUMMARY,
  );
  expect(invDash.totals.inventoryValueSerialized.length).toBeGreaterThan(0);

  await app.close();
});

test("R2: relaunch and verify persistence + bootstrap idempotency", async () => {
  const app = await launchSamyElectron();
  const page = await app.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page);

  const diag2 = await ipcInvoke<{ foreignKeys: { ok: boolean } }>(page, IPC_CHANNELS.SYSTEM_STARTUP_DIAGNOSTICS);
  expect(diag2.foreignKeys.ok).toBe(true);

  const supplier = await ipcInvoke<{ name: string }>(page, IPC_CHANNELS.INVENTORY_SUPPLIER_GET, supplierId);
  expect(supplier.name).toBe(`${marker}-SUP`);

  const rawList = await ipcInvoke<{ items: Array<{ id: string; sku: string }> }>(page, IPC_CHANNELS.INVENTORY_RAW_LIST, {
    page: 1,
    pageSize: 20,
    q: marker,
    includeInactive: true,
  });
  expect(rawList.items.some((r) => r.id === rawId)).toBe(true);

  const invoice = await ipcInvoke<{ invoice: { id: string; status: string } }>(
    page,
    IPC_CHANNELS.SALES_INVOICE_GET,
    invoiceId,
  );
  expect(invoice.invoice.status).toBe("DRAFT");

  const batch = await ipcInvoke<{ code: string; status: string }>(page, IPC_CHANNELS.PRODUCTION_BATCH_GET, batchId);
  expect(batch.status).toBe("PLANNED");

  const invDash = await ipcInvoke<{ totals: { inventoryValueSerialized: string } }>(
    page,
    IPC_CHANNELS.INVENTORY_DASHBOARD_SUMMARY,
  );
  expect(invDash.totals.inventoryValueSerialized.length).toBeGreaterThan(0);

  const packList = await ipcInvoke<{ items: Array<{ sku: string; currentQtySerialized: string }> }>(
    page,
    IPC_CHANNELS.INVENTORY_RAW_LIST,
    { page: 1, pageSize: 10, q: marker, includeInactive: true },
  );
  expect(packList.items.some((r) => r.sku === `${marker}-RAW`)).toBe(true);

  const suppliersDup = await ipcInvoke<{ items: Array<{ name: string }> }>(page, IPC_CHANNELS.INVENTORY_SUPPLIER_LIST, {
    page: 1,
    pageSize: 250,
    q: E2E.supplierName,
  });
  const fixtureSuppliers = suppliersDup.items.filter((s) => s.name === E2E.supplierName);
  expect(fixtureSuppliers.length).toBe(1);

  await gotoHash(page, "/");
  await expect(page.locator('[data-testid="dashboard-page"]')).toBeVisible({ timeout: 60_000 });

  const smoke = await ipcInvoke<{ databaseFilePath?: string }>(page, IPC_CHANNELS.SYSTEM_SMOKE_MAIN_SELFTEST);
  expect(smoke.databaseFilePath).toContain("samye2e.sqlite");

  await app.close();
});
