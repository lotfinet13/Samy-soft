/**
 * Workflow A — validation facture + propagation stock emballage.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electronPath from "electron";
import { expect, test, _electron as electron } from "@playwright/test";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import { ensureLoggedIn, ipcInvoke, reloadAppShell } from "./helpers/app";
import { E2E } from "./helpers/fixtures-data";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test.describe.configure({ mode: "serial" });

let electronApp: Awaited<ReturnType<typeof electron.launch>>;

test.beforeAll(async () => {
  fs.mkdirSync(path.join(ROOT, "e2e", "artifacts"), { recursive: true });
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
});

test.afterAll(async () => {
  await electronApp.close();
});

function dec(s: string): number {
  return Number.parseFloat(s.replace(",", ".")) || 0;
}

test("A: facture brouillon → validation → déstockage → persistance reload", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page);

  const diag = await ipcInvoke<{
    ok: boolean;
    foreignKeys: { ok: boolean; violations: string[] };
    bootstrapSchema: { driftDetected: boolean };
  }>(page, IPC_CHANNELS.SYSTEM_STARTUP_DIAGNOSTICS);
  expect(diag.foreignKeys.ok, `FK: ${diag.foreignKeys.violations.join("; ")}`).toBe(true);
  expect(diag.bootstrapSchema.driftDetected).toBe(false);

  const customers = await ipcInvoke<{ items: Array<{ id: string; code: string }> }>(
    page,
    IPC_CHANNELS.SALES_CUSTOMER_LIST,
    { page: 1, pageSize: 20, q: E2E.customerCode, includeInactive: false },
  );
  const customer = customers.items.find((c) => c.code === E2E.customerCode);
  expect(customer?.id).toBeTruthy();

  const products = await ipcInvoke<{
    items: Array<{ id: string; sku: string; sellingPriceSerialized: string }>;
  }>(page, IPC_CHANNELS.SALES_PRODUCT_LIST, {
    page: 1,
    pageSize: 20,
    q: E2E.productSku,
    includeInactive: true,
  });
  const product = products.items.find((p) => p.sku === E2E.productSku);
  expect(product?.id).toBeTruthy();

  const packBefore = await ipcInvoke<{
    items: Array<{ sku: string; currentQtySerialized: string }>;
  }>(page, IPC_CHANNELS.INVENTORY_PACKAGING_LIST, {
    page: 1,
    pageSize: 5,
    q: E2E.packSku,
    includeInactive: false,
  });
  const packRow = packBefore.items.find((p) => p.sku === E2E.packSku);
  expect(packRow).toBeTruthy();
  const qtyBefore = dec(packRow!.currentQtySerialized);

  const lineQty = "2";
  const unitPrice = product!.sellingPriceSerialized;
  const expectedLineTotal = dec(lineQty) * dec(unitPrice);

  const draft = await ipcInvoke<{ id: string }>(page, IPC_CHANNELS.SALES_INVOICE_CREATE_DRAFT, {
    customerId: customer!.id,
    discountAmount: "0",
    lines: [
      {
        productId: product!.id,
        labelFr: "E2E line",
        quantity: lineQty,
        unitPrice,
        lineDiscount: "0",
        taxRate: "0",
      },
    ],
  });
  expect(draft.id).toBeTruthy();

  const detail = await ipcInvoke<{
    invoice: {
      id: string;
      status: string;
      totalAmountSerialized: string;
      items: Array<{ lineTotalSerialized: string }>;
    };
  }>(page, IPC_CHANNELS.SALES_INVOICE_GET, draft.id);

  expect(detail.invoice.status).toBe("DRAFT");
  expect(dec(detail.invoice.items[0]!.lineTotalSerialized)).toBeCloseTo(expectedLineTotal, 2);

  await ipcInvoke(page, IPC_CHANNELS.SALES_INVOICE_VALIDATE, { invoiceId: draft.id });

  const validated = await ipcInvoke<{ invoice: { status: string } }>(
    page,
    IPC_CHANNELS.SALES_INVOICE_GET,
    draft.id,
  );
  expect(validated.invoice.status).toBe("VALIDATED");

  const packAfter = await ipcInvoke<{
    items: Array<{ sku: string; currentQtySerialized: string }>;
  }>(page, IPC_CHANNELS.INVENTORY_PACKAGING_LIST, {
    page: 1,
    pageSize: 5,
    q: E2E.packSku,
    includeInactive: false,
  });
  const qtyAfter = dec(packAfter.items.find((p) => p.sku === E2E.packSku)!.currentQtySerialized);
  expect(qtyAfter).toBeCloseTo(qtyBefore - dec(lineQty), 3);

  const movements = await ipcInvoke<{
    items: Array<{ inventoryKind: string; qtySignedSerialized: string }>;
  }>(page, IPC_CHANNELS.INVENTORY_MOVEMENT_LIST, { page: 1, pageSize: 80 });
  const salesOut = movements.items.some((m) => m.inventoryKind === "SALES_OUT" && dec(m.qtySignedSerialized) < 0);
  expect(salesOut).toBe(true);

  await reloadAppShell(page);

  const persisted = await ipcInvoke<{ invoice: { status: string } }>(
    page,
    IPC_CHANNELS.SALES_INVOICE_GET,
    draft.id,
  );
  expect(persisted.invoice.status).toBe("VALIDATED");

  const ipcLog = await page.evaluate(() => {
    const g = globalThis as { __SAMY_IPC_LOG__?: Array<{ ok: boolean }> };
    return g.__SAMY_IPC_LOG__ ?? [];
  });
  const failed = ipcLog.filter((e) => !e.ok);
  expect(failed.length).toBe(0);
});
