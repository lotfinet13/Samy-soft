/**
 * Factory Simulation & Operational QA — scripted operator workflows (IPC + selective UI).
 * Writes metrics to e2e/artifacts/factory-simulation-metrics.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electronPath from "electron";
import { expect, test, _electron as electron } from "@playwright/test";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import { ensureLoggedIn, ipcInvoke, reloadAppShell } from "./helpers/app";
import { E2E_DB_PATH } from "./helpers/electron-launch";
import { FactoryMetrics } from "./helpers/factory-metrics";
import { E2E } from "./helpers/fixtures-data";
import { expectModalOpen, gotoHash } from "./helpers/ui";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const metrics = new FactoryMetrics();

test.describe.configure({ mode: "serial" });

let electronApp: Awaited<ReturnType<typeof electron.launch>>;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    cwd: ROOT,
    args: [".", "--samy-e2e"],
    executablePath: electronPath,
    env: {
      ...process.env,
      NODE_ENV: "test",
      SAMY_E2E: "1",
      SAMY_SKIP_DEVTOOLS: "1",
      SAMY_E2E_DATABASE_PATH: E2E_DB_PATH,
    },
  });
});

test.afterAll(async () => {
  await electronApp?.close();
  metrics.flush();
});

test.beforeEach(async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page);
});

function dec(s: string): number {
  return Number.parseFloat(s.replace(",", ".")) || 0;
}

function monthBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

test("FS1 — inventory intake (purchase → movements → integrity)", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });

  const supplier = await metrics.time("fs1-supplier", "inventory-intake", () =>
    ipcInvoke<{ items: Array<{ id: string }> }>(page, IPC_CHANNELS.INVENTORY_SUPPLIER_LIST, {
      page: 1,
      pageSize: 5,
      q: E2E.supplierName,
    }),
  );
  const raw = await metrics.time("fs1-raw", "inventory-intake", () =>
    ipcInvoke<{ items: Array<{ id: string; sku: string }> }>(page, IPC_CHANNELS.INVENTORY_RAW_LIST, {
      page: 1,
      pageSize: 5,
      q: E2E.rawSku,
      includeInactive: false,
    }),
  );
  const material = raw.items.find((r) => r.sku === E2E.rawSku);
  expect(material?.id).toBeTruthy();

  const qtyBefore = dec(
    (
      await ipcInvoke<{ items: Array<{ currentQtySerialized: string }> }>(
        page,
        IPC_CHANNELS.INVENTORY_RAW_LIST,
        { page: 1, pageSize: 3, q: E2E.rawSku, includeInactive: false },
      )
    ).items[0]!.currentQtySerialized,
  );

  await metrics.time("fs1-purchase", "inventory-intake", () =>
    ipcInvoke(page, IPC_CHANNELS.INVENTORY_PURCHASE_CREATE, {
      supplierId: supplier.items[0]!.id,
      purchaseDate: new Date().toISOString(),
      currencyCode: "DZD",
      lines: [{ materialKind: "RAW", rawMaterialId: material!.id, qty: "8", unitPrice: "390" }],
    }),
  );

  const qtyAfter = dec(
    (
      await ipcInvoke<{ items: Array<{ currentQtySerialized: string }> }>(
        page,
        IPC_CHANNELS.INVENTORY_RAW_LIST,
        { page: 1, pageSize: 3, q: E2E.rawSku, includeInactive: false },
      )
    ).items[0]!.currentQtySerialized,
  );
  expect(qtyAfter).toBeGreaterThan(qtyBefore);

  await metrics.time("fs1-movements", "inventory-intake", () =>
    ipcInvoke(page, IPC_CHANNELS.INVENTORY_MOVEMENT_LIST, { page: 1, pageSize: 40 }),
  );

  const integrity = await metrics.time("fs1-integrity", "inventory-intake", () =>
    ipcInvoke<{ ok: boolean }>(page, IPC_CHANNELS.DB_DATA_INTEGRITY_SCAN),
  );
  expect(integrity.ok).toBe(true);
});

test("FS2 — supplier workflows (CRUD + UI navigation latency)", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });

  const name = `FACTORY-SUP-${Date.now()}`;
  const created = await metrics.time("fs2-create", "supplier", () =>
    ipcInvoke<{ id: string; name: string }>(page, IPC_CHANNELS.INVENTORY_SUPPLIER_UPSERT, {
      name,
      isActive: true,
      email: "sim@factory.local",
      contactName: "Chef achat",
      phone: null,
      address: null,
      notes: "factory-sim",
    }),
  );

  await metrics.time("fs2-list", "supplier", () =>
    ipcInvoke(page, IPC_CHANNELS.INVENTORY_SUPPLIER_LIST, { page: 1, pageSize: 30, q: name }),
  );

  await metrics.time("fs2-update", "supplier", () =>
    ipcInvoke(page, IPC_CHANNELS.INVENTORY_SUPPLIER_UPSERT, {
      id: created.id,
      name: `${name}-v2`,
      isActive: true,
      email: null,
    }),
  );

  const navT0 = Date.now();
  await gotoHash(page, "/inventaire/fournisseurs");
  await expect(page.getByRole("heading", { name: "Fournisseurs" })).toBeVisible({ timeout: 60_000 });
  metrics.record("fs2-ui-nav", "supplier", Date.now() - navT0, true);

  await page.locator('[data-testid="supplier-modal-open"]').click();
  await expectModalOpen(page, "supplier-modal");
  await page.keyboard.press("Escape");
});

test("FS3 — repeated invoice creation + duplicate validate guard", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });

  const customer = (
    await ipcInvoke<{ items: Array<{ id: string }> }>(page, IPC_CHANNELS.SALES_CUSTOMER_LIST, {
      page: 1,
      pageSize: 5,
      q: E2E.customerCode,
    })
  ).items[0]!;
  const product = (
    await ipcInvoke<{ items: Array<{ id: string; sellingPriceSerialized: string }> }>(
      page,
      IPC_CHANNELS.SALES_PRODUCT_LIST,
      { page: 1, pageSize: 5, q: E2E.productSku, includeInactive: true },
    )
  ).items[0]!;

  const draftIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const draft = await metrics.time(`fs3-draft-${i}`, "invoice-repeat", () =>
      ipcInvoke<{ id: string }>(page, IPC_CHANNELS.SALES_INVOICE_CREATE_DRAFT, {
        customerId: customer.id,
        discountAmount: "0",
        lines: [
          {
            productId: product.id,
            labelFr: `Sim ${i}`,
            quantity: "1",
            unitPrice: product.sellingPriceSerialized,
            lineDiscount: "0",
            taxRate: "0",
          },
        ],
      }),
    );
    draftIds.push(draft.id);
  }

  for (let i = 0; i < 3; i++) {
    await metrics.time(`fs3-validate-${i}`, "invoice-repeat", () =>
      ipcInvoke(page, IPC_CHANNELS.SALES_INVOICE_VALIDATE, { invoiceId: draftIds[i] }),
    );
  }

  let duplicateBlocked = false;
  try {
    await ipcInvoke(page, IPC_CHANNELS.SALES_INVOICE_VALIDATE, { invoiceId: draftIds[0] });
  } catch (e) {
    duplicateBlocked = e instanceof Error && e.message.includes("déjà traité");
  }
  expect(duplicateBlocked).toBe(true);
  metrics.record("fs3-duplicate-guard", "invoice-repeat", 0, duplicateBlocked);
});

test("FS4 — production batch lifecycle", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });

  const recipe = (
    await ipcInvoke<{ items: Array<{ id: string }> }>(page, IPC_CHANNELS.PRODUCTION_RECIPE_LIST, {
      page: 1,
      pageSize: 5,
      q: E2E.recipeCode,
    })
  ).items[0]!;

  const batch = await metrics.time("fs4-create", "production", () =>
    ipcInvoke<{ batchId: string }>(page, IPC_CHANNELS.PRODUCTION_BATCH_CREATE, {
      recipeId: recipe.id,
      plannedQty: "12",
    }),
  );

  await metrics.time("fs4-start", "production", () =>
    ipcInvoke(page, IPC_CHANNELS.PRODUCTION_BATCH_START, { batchId: batch.batchId }),
  );
  await metrics.time("fs4-complete", "production", () =>
    ipcInvoke(page, IPC_CHANNELS.PRODUCTION_BATCH_COMPLETE, {
      batchId: batch.batchId,
      producedQty: "12",
    }),
  );

  const status = await ipcInvoke<{ status: string }>(page, IPC_CHANNELS.PRODUCTION_BATCH_GET, batch.batchId);
  expect(status.status).toBe("COMPLETED");
});

test("FS5 — stock adjustment + reconciliation signals", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });

  const raw = (
    await ipcInvoke<{ items: Array<{ id: string; sku: string; currentQtySerialized: string }> }>(
      page,
      IPC_CHANNELS.INVENTORY_RAW_LIST,
      { page: 1, pageSize: 3, q: E2E.rawSku, includeInactive: false },
    )
  ).items.find((r) => r.sku === E2E.rawSku)!;

  const targetQty = (dec(raw.currentQtySerialized) + 1.5).toFixed(3);

  await metrics.time("fs5-adjust", "stock-reconcile", () =>
    ipcInvoke(page, IPC_CHANNELS.INVENTORY_MOVEMENT_MANUAL_ADJUSTMENT, {
      materialKind: "RAW",
      rawMaterialId: raw.id,
      targetQty,
      note: "factory-sim reconcile",
    }),
  );

  const after = (
    await ipcInvoke<{ items: Array<{ currentQtySerialized: string }> }>(page, IPC_CHANNELS.INVENTORY_RAW_LIST, {
      page: 1,
      pageSize: 3,
      q: E2E.rawSku,
      includeInactive: false,
    })
  ).items[0]!;
  expect(dec(after.currentQtySerialized)).toBeCloseTo(dec(targetQty), 2);

  const diag = await metrics.time("fs5-startup-diag", "stock-reconcile", () =>
    ipcInvoke<{ ok: boolean; foreignKeys: { ok: boolean } }>(page, IPC_CHANNELS.SYSTEM_STARTUP_DIAGNOSTICS),
  );
  expect(diag.ok).toBe(true);
  expect(diag.foreignKeys.ok).toBe(true);
});

test("FS6 — HR attendance + payroll cycle", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });

  const workers = await ipcInvoke<{ items: Array<{ id: string; code: string }> }>(
    page,
    IPC_CHANNELS.HR_WORKER_LIST,
    { take: 50, q: "E2E-W01", includeInactive: false },
  );
  const worker = workers.items.find((w) => w.code === "E2E-W01");
  expect(worker?.id).toBeTruthy();

  const day = new Date().toISOString().slice(0, 10);
  await metrics.time("fs6-attendance-bulk", "hr", () =>
    ipcInvoke(page, IPC_CHANNELS.HR_ATTENDANCE_BULK_UPSERT, {
      items: [
        {
          workerId: worker!.id,
          workedDate: day,
          status: "PRESENT",
          totalWorkedHours: "8",
          overtimeHours: "0",
        },
      ],
    }),
  );

  const { start, end } = monthBounds();
  const cycle = await metrics.time("fs6-cycle-create", "hr", () =>
    ipcInvoke<{ id: string }>(page, IPC_CHANNELS.HR_PAYROLL_CYCLE_CREATE, {
      label: `Factory sim ${Date.now()}`,
      periodStart: start,
      periodEnd: end,
    }),
  );

  await metrics.time("fs6-payroll-compute", "hr", () =>
    ipcInvoke(page, IPC_CHANNELS.HR_PAYROLL_COMPUTE, { payrollCycleId: cycle.id }),
  );

  const records = await metrics.time("fs6-cycle-records", "hr", () =>
    ipcInvoke<{ items: unknown[] }>(page, IPC_CHANNELS.HR_PAYROLL_CYCLE_RECORDS, cycle.id),
  );
  expect(records.items.length).toBeGreaterThan(0);
});

test("FS7 — backup export + verify drill", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });

  const exported = await metrics.time("fs7-export", "backup", () =>
    ipcInvoke<{ recordId: string; absolutePath: string }>(page, IPC_CHANNELS.BACKUP_EXPORT),
  );
  expect(fs.existsSync(exported.absolutePath)).toBe(true);

  const verified = await metrics.time("fs7-verify", "backup", () =>
    ipcInvoke<{ ok: boolean }>(page, IPC_CHANNELS.BACKUP_VERIFY, { backupId: exported.recordId }),
  );
  expect(verified.ok).toBe(true);

  const health = await metrics.time("fs7-backup-health", "backup", () =>
    ipcInvoke(page, IPC_CHANNELS.BACKUP_HEALTH),
  );
  expect(health).toBeTruthy();

  metrics.note("Full restore drill covered by e2e/backup-restore.spec.ts — destructive to live E2E DB mid-suite.");
});

test("FS8 — restart recovery (cold relaunch + domain survival)", async () => {
  const marker = `FACTORY-RESTART-${Date.now()}`;
  const page1 = await electronApp.firstWindow({ timeout: 120_000 });

  const sup = await ipcInvoke<{ id: string }>(page1, IPC_CHANNELS.INVENTORY_SUPPLIER_UPSERT, {
    name: marker,
    isActive: true,
    email: null,
    contactName: null,
    phone: null,
    address: null,
    notes: "restart",
  });

  await electronApp.close();
  electronApp = await electron.launch({
    cwd: ROOT,
    args: [".", "--samy-e2e"],
    executablePath: electronPath,
    env: {
      ...process.env,
      NODE_ENV: "test",
      SAMY_E2E: "1",
      SAMY_SKIP_DEVTOOLS: "1",
      SAMY_E2E_DATABASE_PATH: E2E_DB_PATH,
    },
  });
  const page2 = await electronApp.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page2);

  const t0 = Date.now();
  const got = await ipcInvoke<{ name: string }>(page2, IPC_CHANNELS.INVENTORY_SUPPLIER_GET, sup.id);
  metrics.record("fs8-supplier-survive", "restart", Date.now() - t0, got.name === marker);

  const diag = await ipcInvoke<{ ok: boolean }>(page2, IPC_CHANNELS.SYSTEM_STARTUP_DIAGNOSTICS);
  expect(diag.ok).toBe(true);
  expect(fs.existsSync(E2E_DB_PATH)).toBe(true);
});

test("FS9 — long-session stability (IPC burst + navigation + memory)", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });
  await metrics.sampleMemory(page, "session-start");

  const routes = ["/", "/inventaire/matières", "/ventes/factures", "/production/lots", "/rh/paie"];
  for (let round = 0; round < 3; round++) {
    for (const route of routes) {
      const t0 = Date.now();
      await gotoHash(page, route);
      await page.waitForFunction(() => (document.getElementById("root")?.childElementCount ?? 0) > 0, {
        timeout: 60_000,
      });
      metrics.record(`fs9-nav-${round}-${route}`, "long-session", Date.now() - t0, true);
    }
    await metrics.time(`fs9-ipc-burst-${round}`, "long-session", async () => {
      await ipcInvoke(page, IPC_CHANNELS.INVENTORY_RAW_LIST, { page: 1, pageSize: 50 });
      await ipcInvoke(page, IPC_CHANNELS.SALES_INVOICE_LIST, { page: 1, pageSize: 50 });
      await ipcInvoke(page, IPC_CHANNELS.PRODUCTION_BATCH_LIST, { page: 1, pageSize: 50 });
      await ipcInvoke(page, IPC_CHANNELS.HR_WORKER_LIST, { take: 50 });
    });
  }

  await metrics.sampleMemory(page, "session-end");
  const ipcLog = await page.evaluate(() => {
    const g = globalThis as { __SAMY_IPC_LOG__?: Array<{ ok: boolean }> };
    return g.__SAMY_IPC_LOG__?.filter((e) => !e.ok).length ?? 0;
  });
  metrics.record("fs9-ipc-failures", "long-session", 0, ipcLog === 0, `failures=${ipcLog}`);
  expect(ipcLog).toBe(0);
});

test("FS10 — large dataset list responsiveness", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });

  const bulkStatsPath = path.join(ROOT, ".data", "factory-bulk-stats.json");
  if (fs.existsSync(bulkStatsPath)) {
    const stats = JSON.parse(fs.readFileSync(bulkStatsPath, "utf8")) as { rawTotal?: number };
    metrics.note(`Bulk seed rawTotal=${stats.rawTotal ?? "?"}`);
  } else {
    metrics.note("Bulk seed stats absent — run scripts/factory-simulation-bulk-seed.ts before suite.");
  }

  const list = await metrics.time("fs10-raw-list-100", "large-dataset", () =>
    ipcInvoke<{ items: unknown[]; total?: number }>(page, IPC_CHANNELS.INVENTORY_RAW_LIST, {
      page: 1,
      pageSize: 100,
      includeInactive: true,
    }),
  );
  expect(list.items.length).toBeGreaterThan(0);

  const suppliers = await metrics.time("fs10-supplier-list-100", "large-dataset", () =>
    ipcInvoke<{ items: unknown[] }>(page, IPC_CHANNELS.INVENTORY_SUPPLIER_LIST, {
      page: 1,
      pageSize: 100,
    }),
  );
  expect(suppliers.items.length).toBeGreaterThan(0);

  const navT0 = Date.now();
  await gotoHash(page, "/inventaire/matières");
  await page.waitForFunction(() => (document.getElementById("root")?.childElementCount ?? 0) > 0, {
    timeout: 90_000,
  });
  metrics.record("fs10-materials-ui", "large-dataset", Date.now() - navT0, true);

  await reloadAppShell(page);
  await metrics.sampleMemory(page, "after-large-list-reload");
});
