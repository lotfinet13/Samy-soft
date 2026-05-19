/**
 * Workflow B — lot production : consommation MP + clôture.
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

test("B: lot production — start → complete → stock MP ↓ → persistance", async () => {
  const page = await electronApp.firstWindow({ timeout: 120_000 });
  await ensureLoggedIn(page);

  const recipes = await ipcInvoke<{ items: Array<{ id: string; code: string }> }>(
    page,
    IPC_CHANNELS.PRODUCTION_RECIPE_LIST,
    { page: 1, pageSize: 10, q: E2E.recipeCode, includeInactive: true },
  );
  const recipe = recipes.items.find((r) => r.code === E2E.recipeCode);
  expect(recipe?.id).toBeTruthy();

  const rawBefore = await ipcInvoke<{
    items: Array<{ sku: string; currentQtySerialized: string }>;
  }>(page, IPC_CHANNELS.INVENTORY_RAW_LIST, {
    page: 1,
    pageSize: 5,
    q: E2E.rawSku,
    includeInactive: false,
  });
  const rawRow = rawBefore.items.find((r) => r.sku === E2E.rawSku);
  expect(rawRow).toBeTruthy();
  const rawQtyBefore = dec(rawRow!.currentQtySerialized);

  const plannedQty = "10";
  const created = await ipcInvoke<{ batchId: string; code: string }>(
    page,
    IPC_CHANNELS.PRODUCTION_BATCH_CREATE,
    { recipeId: recipe!.id, plannedQty },
  );
  expect(created.batchId).toBeTruthy();

  await ipcInvoke(page, IPC_CHANNELS.PRODUCTION_BATCH_START, { batchId: created.batchId });
  await ipcInvoke(page, IPC_CHANNELS.PRODUCTION_BATCH_COMPLETE, {
    batchId: created.batchId,
    producedQty: plannedQty,
  });

  const batch = await ipcInvoke<{ status: string }>(
    page,
    IPC_CHANNELS.PRODUCTION_BATCH_GET,
    created.batchId,
  );
  expect(batch.status).toBe("COMPLETED");

  const rawAfter = await ipcInvoke<{
    items: Array<{ sku: string; currentQtySerialized: string }>;
  }>(page, IPC_CHANNELS.INVENTORY_RAW_LIST, {
    page: 1,
    pageSize: 5,
    q: E2E.rawSku,
    includeInactive: false,
  });
  const rawQtyAfter = dec(rawAfter.items.find((r) => r.sku === E2E.rawSku)!.currentQtySerialized);
  expect(rawQtyAfter).toBeLessThan(rawQtyBefore);

  const movements = await ipcInvoke<{
    items: Array<{ inventoryKind: string }>;
  }>(page, IPC_CHANNELS.INVENTORY_MOVEMENT_LIST, { page: 1, pageSize: 100 });
  const prodOut = movements.items.some((m) => m.inventoryKind === "PRODUCTION_OUT");
  expect(prodOut).toBe(true);

  await reloadAppShell(page);

  const persisted = await ipcInvoke<{ status: string }>(
    page,
    IPC_CHANNELS.PRODUCTION_BATCH_GET,
    created.batchId,
  );
  expect(persisted.status).toBe("COMPLETED");
});
