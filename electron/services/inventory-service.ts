import {
  InventoryMovementKind,
  InventoryUnit,
  MaterialKind,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

type DbClient = PrismaClient | Prisma.TransactionClient;

export function decimalToString(value: unknown): string {
  try {
    if (value == null || value === "") return "0";
    if (value instanceof Decimal) {
      return value.toFixed(6).replace(/\.?0+$/, "");
    }
    if (typeof value === "object" && value !== null && "d" in value) {
      return new Decimal(value as Decimal).toFixed(6).replace(/\.?0+$/, "");
    }
    return new Decimal(value as string | number).toFixed(6).replace(/\.?0+$/, "");
  } catch {
    return "0";
  }
}

export function parseDecimal(raw: string | number): Decimal {
  try {
    return new Decimal(String(raw));
  } catch {
    throw new Error("Montant décimal invalide.");
  }
}

export async function getCurrentQty(
  prisma: DbClient,
  materialKind: MaterialKind,
  materialId: string,
): Promise<Decimal> {
  const agg = await prisma.stockMovement.aggregate({
    _sum: { qtySigned: true },
    where:
      materialKind === "RAW"
        ? { rawMaterialId: materialId }
        : { packagingMaterialId: materialId },
  });

  const sum = agg._sum.qtySigned;
  return sum ?? new Decimal(0);
}

function assertNonNegativeQtyAfter(after: Decimal): void {
  if (after.lt(0)) {
    throw new Error("Stock négatif interdit après mouvement.");
  }
}

function weightedAverageCost(opts: {
  beforeQty: Decimal;
  beforeCost: Decimal;
  incomingQty: Decimal;
  incomingPrice: Decimal;
}): Decimal {
  const { beforeQty, beforeCost, incomingQty, incomingPrice } = opts;
  const numerator = beforeQty.mul(beforeCost).add(incomingQty.mul(incomingPrice));
  const denom = beforeQty.add(incomingQty);
  if (denom.eq(0)) return incomingPrice;
  return numerator.div(denom);
}

export async function postSignedMovement(opts: {
  prisma: DbClient;
  materialKind: MaterialKind;
  materialId: string;
  qtySigned: Decimal;
  inventoryKind: InventoryMovementKind;
  occurredAt?: Date;
  expiresAt?: Date | null;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
  userId?: string | null;
}): Promise<void> {
  const before = await getCurrentQty(opts.prisma, opts.materialKind, opts.materialId);
  const after = before.add(opts.qtySigned);
  assertNonNegativeQtyAfter(after);

  await opts.prisma.stockMovement.create({
    data: {
      materialKind: opts.materialKind,
      rawMaterialId: opts.materialKind === "RAW" ? opts.materialId : null,
      packagingMaterialId: opts.materialKind === "PACKAGING" ? opts.materialId : null,
      qtyBefore: before,
      qtyAfter: after,
      qtySigned: opts.qtySigned,
      inventoryKind: opts.inventoryKind,
      expiresAt: opts.expiresAt ?? null,
      referenceType: opts.referenceType ?? null,
      referenceId: opts.referenceId ?? null,
      note: opts.note ?? null,
      occurredAt: opts.occurredAt ?? new Date(),
      createdById: opts.userId ?? null,
    },
  });
}

export function computeNextWeightedUnitCost(opts: {
  stockBeforeInbound: Decimal;
  currentCostUnit: Decimal;
  qtyIn: Decimal;
  unitPrice: Decimal;
}): Decimal {
  return weightedAverageCost({
    beforeQty: opts.stockBeforeInbound,
    beforeCost: opts.currentCostUnit,
    incomingQty: opts.qtyIn,
    incomingPrice: opts.unitPrice,
  });
}

export async function createPurchaseEntryLedger(opts: {
  prisma: PrismaClient;
  input: {
    supplierId: string;
    invoiceRef?: string | null;
    purchaseDate: Date;
    currencyCode?: string | null;
    notes?: string | null;
    createdById: string | null;
    lines: Array<{
      materialKind: MaterialKind;
      rawMaterialId?: string;
      packagingMaterialId?: string;
      qtyIn: Decimal;
      unitPrice: Decimal;
      expiresAt?: Date | null;
      labelSnapshot?: string;
      skuSnapshot?: string;
      unitSnapshot?: InventoryUnit | null;
    }>;
  };
}): Promise<{ purchaseId: string }> {
  const prisma = opts.prisma;

  return prisma.$transaction(async (tx) => {
    let aggregateTotal = new Decimal(0);

    const entry = await tx.purchaseEntry.create({
      data: {
        supplierId: opts.input.supplierId,
        invoiceRef: opts.input.invoiceRef ?? null,
        purchaseDate: opts.input.purchaseDate,
        currencyCode: opts.input.currencyCode ?? "DZD",
        notes: opts.input.notes ?? null,
        createdById: opts.input.createdById,
      },
      select: { id: true },
    });

    for (const line of opts.input.lines) {
      const materialId =
        line.materialKind === "RAW" ? line.rawMaterialId! : line.packagingMaterialId!;
      const materialKind = line.materialKind;

      const lineTotalComputed = line.qtyIn.mul(line.unitPrice);
      aggregateTotal = aggregateTotal.add(lineTotalComputed);

      const dbLine = await tx.purchaseEntryLine.create({
        data: {
          purchaseEntryId: entry.id,
          materialKind,
          rawMaterialId: materialKind === "RAW" ? materialId : null,
          packagingMaterialId: materialKind === "PACKAGING" ? materialId : null,
          qty: line.qtyIn,
          unitPrice: line.unitPrice,
          lineTotal: lineTotalComputed,
          expiresAt: line.expiresAt ?? null,
          labelSnapshot: line.labelSnapshot ?? null,
          skuSnapshot: line.skuSnapshot ?? null,
          unitSnapshot: line.unitSnapshot ?? undefined,
        },
        select: { id: true },
      });

      const stockBeforeInbound = await getCurrentQty(tx, materialKind, materialId);

      if (materialKind === "RAW") {
        const material = await tx.rawMaterial.findUniqueOrThrow({
          where: { id: materialId },
        });
        const nextCost = computeNextWeightedUnitCost({
          stockBeforeInbound,
          currentCostUnit: material.costPriceUnit,
          qtyIn: line.qtyIn,
          unitPrice: line.unitPrice,
        });
        await tx.rawMaterial.update({
          where: { id: materialId },
          data: { costPriceUnit: nextCost },
        });
      } else {
        const material = await tx.packagingMaterial.findUniqueOrThrow({
          where: { id: materialId },
        });
        const nextCost = computeNextWeightedUnitCost({
          stockBeforeInbound,
          currentCostUnit: material.costPriceUnit,
          qtyIn: line.qtyIn,
          unitPrice: line.unitPrice,
        });
        await tx.packagingMaterial.update({
          where: { id: materialId },
          data: { costPriceUnit: nextCost },
        });
      }

      await postSignedMovement({
        prisma: tx,
        materialKind,
        materialId,
        qtySigned: line.qtyIn,
        inventoryKind: InventoryMovementKind.PURCHASE_IN,
        occurredAt: opts.input.purchaseDate,
        expiresAt: line.expiresAt ?? null,
        referenceType: "PurchaseEntryLine",
        referenceId: dbLine.id,
        note: null,
        userId: opts.input.createdById,
      });
    }

    await tx.purchaseEntry.update({
      where: { id: entry.id },
      data: { totalAmount: aggregateTotal },
    });

    return { purchaseId: entry.id };
  });
}

