/**
 * Factory simulation — volumetric seed for E2E DB only.
 * Usage: cross-env DATABASE_URL=file:../.data/e2e/samye2e.sqlite tsx scripts/factory-simulation-bulk-seed.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { InventoryUnit, PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATS_OUT = path.join(ROOT, ".data", "factory-bulk-stats.json");

const RAW_COUNT = Number(process.env.FACTORY_BULK_RAW_COUNT ?? "350");
const SUPPLIER_COUNT = Number(process.env.FACTORY_BULK_SUPPLIER_COUNT ?? "120");

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.includes("e2e")) {
    console.error("[factory-bulk] Refus : DATABASE_URL doit pointer vers la base E2E (.data/e2e/).");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const t0 = Date.now();

  const existingBulk = await prisma.rawMaterial.count({
    where: { sku: { startsWith: "FACTORY-BULK-RAW-" } },
  });

  if (existingBulk < RAW_COUNT) {
    const toCreate = RAW_COUNT - existingBulk;
    for (let i = 0; i < toCreate; i += 50) {
      const batch = Array.from({ length: Math.min(50, toCreate - i) }, (_, j) => {
        const n = existingBulk + i + j;
        return {
          sku: `FACTORY-BULK-RAW-${String(n).padStart(5, "0")}`,
          labelFr: `Matière bulk simulation ${n}`,
          category: "FACTORY_SIM",
          unit: InventoryUnit.KG,
          minimumStockQty: new Decimal(1),
          costPriceUnit: new Decimal(100 + (n % 50)),
          isActive: true,
        };
      });
      await prisma.rawMaterial.createMany({ data: batch });
    }
  }

  const existingSup = await prisma.supplier.count({
    where: { name: { startsWith: "FACTORY-BULK-SUP-" } },
  });
  if (existingSup < SUPPLIER_COUNT) {
    const toCreate = SUPPLIER_COUNT - existingSup;
    for (let i = 0; i < toCreate; i += 50) {
      const batch = Array.from({ length: Math.min(50, toCreate - i) }, (_, j) => {
        const n = existingSup + i + j;
        return {
          name: `FACTORY-BULK-SUP-${String(n).padStart(4, "0")}`,
          notes: "Factory simulation bulk",
          isActive: true,
        };
      });
      await prisma.supplier.createMany({ data: batch });
    }
  }

  const rawTotal = await prisma.rawMaterial.count();
  const supplierTotal = await prisma.supplier.count();
  const movementTotal = await prisma.stockMovement.count();
  const invoiceTotal = await prisma.invoice.count();
  const elapsedMs = Date.now() - t0;

  const stats = {
    timestamp: new Date().toISOString(),
    rawBulkTarget: RAW_COUNT,
    supplierBulkTarget: SUPPLIER_COUNT,
    rawTotal,
    supplierTotal,
    movementTotal,
    invoiceTotal,
    seedElapsedMs: elapsedMs,
  };

  fs.mkdirSync(path.dirname(STATS_OUT), { recursive: true });
  fs.writeFileSync(STATS_OUT, JSON.stringify(stats, null, 2), "utf8");
  console.log("[factory-bulk]", JSON.stringify(stats));
  await prisma.$disconnect();
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
