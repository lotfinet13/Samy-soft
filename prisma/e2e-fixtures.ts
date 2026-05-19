/**
 * Fixes E2E déterministes — exécuter après `db:seed` sur la base `.data/e2e/*.sqlite`.
 * Ne jamais lancer contre une base de production.
 */
import {
  InventoryMovementKind,
  InventoryUnit,
  MaterialKind,
  PrismaClient,
  SalaryType,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { postSignedMovement } from "../electron/services/inventory-service.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.SAMY_E2E_SKIP_FIXTURES === "1") {
    console.log("[e2e-fixtures] skip (SAMY_E2E_SKIP_FIXTURES)");
    return;
  }

  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  const adminId = admin?.id ?? null;

  /** Évite l’accumulation de fournisseurs éphémères (pagination E2E > pageSize). */
  const ephemeralSuppliers = await prisma.supplier.findMany({
    where: {
      OR: [
        { name: { startsWith: "E2E-UI-SUP-" } },
        { name: { startsWith: "E2E-SUP-" } },
        { name: { startsWith: "E2E-RESTART-" } },
      ],
    },
    select: { id: true },
  });
  const ephemeralIds = ephemeralSuppliers.map((s) => s.id);
  if (ephemeralIds.length > 0) {
    await prisma.purchaseEntry.deleteMany({ where: { supplierId: { in: ephemeralIds } } });
    await prisma.rawMaterial.updateMany({
      where: { supplierId: { in: ephemeralIds } },
      data: { supplierId: null },
    });
    await prisma.packagingMaterial.updateMany({
      where: { supplierId: { in: ephemeralIds } },
      data: { supplierId: null },
    });
    await prisma.supplier.deleteMany({ where: { id: { in: ephemeralIds } } });
  }
  await prisma.rawMaterial.deleteMany({
    where: {
      AND: [{ sku: { startsWith: "E2E-RAW-" } }, { sku: { not: "E2E-RAW-VANILLE" } }],
    },
  });
  await prisma.rawMaterial.deleteMany({ where: { sku: { startsWith: "E2E-UI-RAW-" } } });

  let supplier = await prisma.supplier.findFirst({ where: { name: "__E2E_SUPPLIER__" } });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        name: "__E2E_SUPPLIER__",
        notes: "Fixtures tests automatisés",
      },
    });
  }

  const raw = await prisma.rawMaterial.upsert({
    where: { sku: "E2E-RAW-VANILLE" },
    update: {},
    create: {
      sku: "E2E-RAW-VANILLE",
      labelFr: "Vanille (fixture E2E)",
      category: "E2E",
      unit: InventoryUnit.KG,
      minimumStockQty: new Decimal(1),
      costPriceUnit: new Decimal(420),
      isActive: true,
      supplierId: supplier.id,
    },
    select: { id: true },
  });

  void raw;

  const packaging = await prisma.packagingMaterial.upsert({
    where: { sku: "E2E-PKG-POT500" },
    update: {},
    create: {
      sku: "E2E-PKG-POT500",
      labelFr: "Pot 500g (fixture E2E)",
      category: "E2E",
      unit: InventoryUnit.UNIT,
      minimumStockQty: new Decimal(10),
      costPriceUnit: new Decimal(8),
      isActive: true,
      supplierId: supplier.id,
    },
    select: { id: true },
  });

  const packInbound = await prisma.stockMovement.count({
    where: { referenceType: "E2E_SEED_PACK_INBOUND" },
  });
  if (packInbound === 0) {
    await postSignedMovement({
      prisma,
      materialKind: MaterialKind.PACKAGING,
      materialId: packaging.id,
      qtySigned: new Decimal(200),
      inventoryKind: InventoryMovementKind.PURCHASE_IN,
      referenceType: "E2E_SEED_PACK_INBOUND",
      referenceId: "e2e-pack-001",
      userId: adminId,
    });
  }

  const existingInbound = await prisma.stockMovement.count({
    where: {
      referenceType: "E2E_SEED_INBOUND",
    },
  });
  if (existingInbound === 0) {
    await postSignedMovement({
      prisma,
      materialKind: MaterialKind.RAW,
      materialId: raw.id,
      qtySigned: new Decimal(500),
      inventoryKind: InventoryMovementKind.PURCHASE_IN,
      referenceType: "E2E_SEED_INBOUND",
      referenceId: "e2e-batch-001",
      userId: adminId,
    });
  }

  const recipe = await prisma.recipe.upsert({
    where: { code: "E2E-Glace-Vanille-v1" },
    update: {},
    create: {
      code: "E2E-Glace-Vanille-v1",
      labelFr: "Glace vanille — recette fixture E2E",
      yieldQty: new Decimal(100),
      yieldUnit: InventoryUnit.KG,
      isActive: true,
    },
    select: { id: true },
  });

  await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
  await prisma.recipeIngredient.create({
    data: {
      recipeId: recipe.id,
      rawMaterialId: raw.id,
      quantity: new Decimal(12),
      unit: InventoryUnit.KG,
      wastePct: new Decimal(2),
      sortOrder: 0,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { code: "__E2E_CUSTOMER__" },
    update: {},
    create: {
      code: "__E2E_CUSTOMER__",
      name: "Client Test E2E",
      isActive: true,
    },
    select: { id: true },
  });

  await prisma.product.upsert({
    where: { sku: "E2E-PROD-POT500" },
    update: {
      packagingMaterialId: packaging.id,
      recipeId: recipe.id,
      isActive: true,
    },
    create: {
      sku: "E2E-PROD-POT500",
      name: "Glace pot 500g — E2E",
      sellingPrice: new Decimal(220),
      unit: InventoryUnit.UNIT,
      recipeId: recipe.id,
      packagingMaterialId: packaging.id,
      isActive: true,
    },
  });

  void customer;

  await prisma.worker.upsert({
    where: { code: "E2E-W01" },
    update: {},
    create: {
      code: "E2E-W01",
      firstName: "Test",
      lastName: "Opérateur E2E",
      salaryType: SalaryType.MONTHLY,
      baseSalary: new Decimal(85000),
      overtimeRate: new Decimal(450),
      isActive: true,
    },
  });

  console.log("[e2e-fixtures] OK");
}

void main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
