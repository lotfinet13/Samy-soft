/**
 * Workflow C — cycles CRUD + persistance (IPC + reload).
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

test("C1: fournisseur — create → read → update → reload", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page);

  const name = `E2E-SUP-${Date.now()}`;
  const created = await ipcInvoke<{ id: string; name: string }>(page, IPC_CHANNELS.INVENTORY_SUPPLIER_UPSERT, {
    name,
    isActive: true,
    email: null,
    contactName: "E2E",
    phone: null,
    address: null,
    notes: "crud-e2e",
  });
  expect(created.name).toBe(name);

  const detail = await ipcInvoke<{ name: string; notes: string | null }>(
    page,
    IPC_CHANNELS.INVENTORY_SUPPLIER_GET,
    created.id,
  );
  expect(detail.name).toBe(name);

  const updatedName = `${name}-v2`;
  await ipcInvoke(page, IPC_CHANNELS.INVENTORY_SUPPLIER_UPSERT, {
    id: created.id,
    name: updatedName,
    isActive: true,
    email: null,
  });

  await reloadAppShell(page);

  const afterReload = await ipcInvoke<{ name: string }>(page, IPC_CHANNELS.INVENTORY_SUPPLIER_GET, created.id);
  expect(afterReload.name).toBe(updatedName);
});

test("C2: matière première — upsert → liste → reload", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page);

  const sku = `E2E-RAW-${Date.now()}`;
  const upserted = await ipcInvoke<{ sku: string; labelFr: string }>(page, IPC_CHANNELS.INVENTORY_RAW_UPSERT, {
    sku,
    labelFr: "MP test E2E",
    unit: "KG",
    minimumStockQty: "1",
    costPriceUnit: "100",
    expirationTracking: false,
    isActive: true,
  });
  expect(upserted.sku).toBe(sku);

  const list = await ipcInvoke<{ items: Array<{ sku: string }> }>(page, IPC_CHANNELS.INVENTORY_RAW_LIST, {
    page: 1,
    pageSize: 20,
    q: sku,
    includeInactive: true,
  });
  expect(list.items.some((i) => i.sku === sku)).toBe(true);

  await reloadAppShell(page);

  const list2 = await ipcInvoke<{ items: Array<{ sku: string }> }>(page, IPC_CHANNELS.INVENTORY_RAW_LIST, {
    page: 1,
    pageSize: 20,
    q: sku,
    includeInactive: true,
  });
  expect(list2.items.some((i) => i.sku === sku)).toBe(true);
});

test("C3: achat — création → journal → reload", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page);

  const suppliers = await ipcInvoke<{ items: Array<{ id: string; name: string }> }>(
    page,
    IPC_CHANNELS.INVENTORY_SUPPLIER_LIST,
    { page: 1, pageSize: 5, q: E2E.supplierName },
  );
  const supplier = suppliers.items[0];
  expect(supplier?.id).toBeTruthy();

  const raw = await ipcInvoke<{ items: Array<{ id: string; sku: string }> }>(
    page,
    IPC_CHANNELS.INVENTORY_RAW_LIST,
    { page: 1, pageSize: 5, q: E2E.rawSku, includeInactive: false },
  );
  const material = raw.items.find((r) => r.sku === E2E.rawSku);
  expect(material?.id).toBeTruthy();

  const entry = await ipcInvoke<{ id: string }>(page, IPC_CHANNELS.INVENTORY_PURCHASE_CREATE, {
    supplierId: supplier!.id,
    purchaseDate: new Date().toISOString(),
    currencyCode: "DZD",
    lines: [
      {
        materialKind: "RAW",
        rawMaterialId: material!.id,
        qty: "5",
        unitPrice: "400",
      },
    ],
  });
  expect(entry.id).toBeTruthy();

  await reloadAppShell(page);

  const purchases = await ipcInvoke<{ items: Array<{ id: string }> }>(
    page,
    IPC_CHANNELS.INVENTORY_PURCHASE_LIST,
    { page: 1, pageSize: 30 },
  );
  expect(purchases.items.some((p) => p.id === entry.id)).toBe(true);
});
