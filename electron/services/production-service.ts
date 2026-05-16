import {
  BatchStatus,
  InventoryMovementKind,
  InventoryUnit,
  MaterialKind,
  Prisma,
  PrismaClient,
  type Recipe,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import {
  decimalToString,
  getCurrentQty,
  parseDecimal,
  postSignedMovement,
} from "./inventory-service.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const PRODUCTION_BATCH_REF = "ProductionBatch";

export type ScaledConsumptionLine = {
  rawMaterialId: string;
  sku: string;
  labelFr: string;
  unit: InventoryUnit;
  baseQtyScaled: Decimal;
  wastePct: Decimal;
  grossQty: Decimal;
  warehouseQty: Decimal;
  shortageQty: Decimal;
  lineCostIngredient: Decimal;
};

export type ShortageFinding = Pick<
  ScaledConsumptionLine,
  "rawMaterialId" | "sku" | "labelFr" | "grossQty" | "warehouseQty" | "shortageQty"
>;

function wastageMultiplier(wastePct: Decimal): Decimal {
  return new Decimal(1).add(wastePct.div(100));
}

function assertIngredientUnitCompatibility(
  ingredientUnit: InventoryUnit,
  materialUnit: InventoryUnit,
  sku: string,
): void {
  if (ingredientUnit !== materialUnit) {
    throw new Error(`Unités incompatibles sur ${sku}: recette (${ingredientUnit}) vs fiche (${materialUnit}).`);
  }
}

/** Multiplicateur = quantité cible fabrication / rendement formulé standard. */
export function computeRecipeScaleMultiplier(params: {
  producedTargetQty: Decimal;
  yieldQty: Decimal;
}): Decimal {
  if (!params.yieldQty.gt(0)) {
    throw new Error("yieldQty doit être strictement positif.");
  }
  return params.producedTargetQty.div(params.yieldQty);
}

export async function previewScaledConsumption(
  prisma: DbClient,
  params: {
    recipeId: string;
    producedQty: Decimal | string | number;
  },
): Promise<ScaledConsumptionLine[]> {
  const produced = typeof params.producedQty === "object" ? params.producedQty : parseDecimal(String(params.producedQty));

  const recipe = await prisma.recipe.findUniqueOrThrow({
    where: { id: params.recipeId },
    include: {
      ingredients: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { rawMaterial: true },
      },
    },
  });

  const mult = computeRecipeScaleMultiplier({ producedTargetQty: produced, yieldQty: recipe.yieldQty });

  const lines: ScaledConsumptionLine[] = [];
  for (const line of recipe.ingredients) {
    assertIngredientUnitCompatibility(line.unit, line.rawMaterial.unit, line.rawMaterial.sku);
    const baseQtyScaled = parseDecimal(decimalToString(line.quantity)).mul(mult);
    const wm = wastageMultiplier(line.wastePct);
    const grossQty = baseQtyScaled.mul(wm);
    const warehouseQty = await getCurrentQty(prisma, MaterialKind.RAW, line.rawMaterialId);
    const shortageQty = grossQty.gt(warehouseQty) ? grossQty.minus(warehouseQty) : new Decimal(0);

    const unitCost = parseDecimal(decimalToString(line.rawMaterial.costPriceUnit));

    lines.push({
      rawMaterialId: line.rawMaterialId,
      sku: line.rawMaterial.sku,
      labelFr: line.rawMaterial.labelFr,
      unit: line.rawMaterial.unit,
      baseQtyScaled,
      wastePct: line.wastePct,
      grossQty,
      warehouseQty,
      shortageQty,
      lineCostIngredient: grossQty.mul(unitCost),
    });
  }

  return lines;
}

export async function auditShortages(
  prisma: DbClient,
  params: {
    recipeId: string;
    producedQty: Decimal | string | number;
  },
): Promise<ShortageFinding[]> {
  const rows = await previewScaledConsumption(prisma, params);
  return rows.filter((row) => row.shortageQty.gt(0)).map(({ rawMaterialId, sku, labelFr, grossQty, warehouseQty, shortageQty }) => ({
    rawMaterialId,
    sku,
    labelFr,
    grossQty,
    warehouseQty,
    shortageQty,
  }));
}

function mergeMetadata(existing: string, patch: Record<string, unknown>): string {
  let base: Record<string, unknown> = {};
  try {
    base = JSON.parse(existing ?? "{}") as Record<string, unknown>;
  } catch {
    base = {};
  }

  const merged = {
    ...base,
    ...patch,
  };

  return JSON.stringify(merged);
}

async function hydrateRecipeFully(prisma: DbClient, recipeId: string) {
  return prisma.recipe.findUniqueOrThrow({
    where: { id: recipeId },
    include: {
      ingredients: {
        include: { rawMaterial: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
      outputPackagingMaterial: true,
    },
  });
}

async function hydrateBatchFully(prisma: DbClient, batchId: string) {
  return prisma.productionBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      recipe: true,
      operationLogs: { orderBy: { startedAt: "desc" }, take: 40 },
      createdBy: { select: { id: true, displayName: true, username: true } },
      operator: { select: { id: true, displayName: true, username: true } },
    },
  });
}

/** Crée ou met à jour l’ossature recette (les lignes = endpoint dédiés). */
export async function persistRecipeMetadata(
  prisma: PrismaClient,
  dto: {
    id?: string | undefined;
    code: string;
    labelFr: string;
    category?: string | null;
    description?: string | null;
    productionNotes?: string | null;
    yieldQty: Decimal;
    yieldUnit: InventoryUnit;
    estimatedMinutes?: number | null;
    isActive?: boolean;
    recipeVersion?: number | null;
    parentRecipeId?: string | null;
    outputPackagingMaterialId?: string | null;
  },
): Promise<Recipe> {
  const payload = {
    code: dto.code.trim(),
    labelFr: dto.labelFr.trim(),
    category: dto.category?.trim()?.length ? dto.category.trim() : null,
    description: dto.description?.trim()?.length ? dto.description.trim() : null,
    productionNotes: dto.productionNotes?.trim()?.length ? dto.productionNotes.trim() : null,
    yieldQty: dto.yieldQty,
    yieldUnit: dto.yieldUnit,
    estimatedMinutes: dto.estimatedMinutes ?? null,
    isActive: dto.isActive ?? true,
    recipeVersion: dto.recipeVersion ?? 1,
    parentRecipeId: dto.parentRecipeId ?? null,
    outputPackagingMaterialId: dto.outputPackagingMaterialId ?? null,
  };

  if (!dto.id) {
    return prisma.recipe.create({
      data: payload,
    });
  }

  return prisma.recipe.update({
    where: { id: dto.id },
    data: payload,
  });
}

export async function syncRecipeIngredientLines(prisma: PrismaClient, params: {
  recipeId: string;
  lines: Array<{
    rawMaterialId: string;
    quantity: Decimal | string | number;
    unit: InventoryUnit;
    optionalIngredient?: boolean;
    wastePct?: Decimal | string | number | null;
    sortOrder?: number;
    note?: string | null;
  }>;
}): Promise<number> {
  await prisma.recipeIngredient.deleteMany({ where: { recipeId: params.recipeId } });

  for (let i = 0; i < params.lines.length; i += 1) {
    const draft = params.lines[i]!;
    const waste = draft.wastePct == null ? new Decimal(0) : parseDecimal(String(draft.wastePct));

    await prisma.recipeIngredient.create({
      data: {
        recipeId: params.recipeId,
        rawMaterialId: draft.rawMaterialId,
        quantity: parseDecimal(String(draft.quantity)),
        unit: draft.unit,
        optionalIngredient: draft.optionalIngredient ?? false,
        wastePct: waste,
        sortOrder: draft.sortOrder ?? i,
        note: draft.note ?? null,
      },
    });

    const material = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: draft.rawMaterialId } });
    assertIngredientUnitCompatibility(draft.unit, material.unit, material.sku);
  }

  return params.lines.length;
}

export async function duplicateRecipeFabric(
  prisma: PrismaClient,
  opts: {
    recipeId: string;
    newCode?: string | null;
  },
): Promise<Recipe> {
  const source = await prisma.recipe.findUniqueOrThrow({
    where: { id: opts.recipeId },
    include: {
      ingredients: {
        include: { rawMaterial: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });

  const code =
    opts.newCode?.trim() ||
    `${source.code}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-clone`;

  const clone = await prisma.recipe.create({
    data: {
      code,
      labelFr: `${source.labelFr} · copie`,
      category: source.category,
      description: source.description,
      productionNotes: source.productionNotes,
      yieldQty: source.yieldQty,
      yieldUnit: source.yieldUnit,
      estimatedMinutes: source.estimatedMinutes,
      isActive: false,
      recipeVersion: source.recipeVersion + 1,
      parentRecipeId: source.id,
      outputPackagingMaterialId: source.outputPackagingMaterialId,
    },
  });

  await syncRecipeIngredientLines(prisma, {
    recipeId: clone.id,
    lines: source.ingredients.map((line) => ({
      rawMaterialId: line.rawMaterialId,
      quantity: line.quantity,
      unit: line.unit,
      optionalIngredient: line.optionalIngredient,
      wastePct: line.wastePct,
      sortOrder: line.sortOrder,
      note: line.note ?? null,
    })),
  });

  return prisma.recipe.findUniqueOrThrow({
    where: { id: clone.id },
  });
}

export async function seedProductionBatch(
  prisma: PrismaClient,
  params: {
    recipeId: string;
    plannedQty: Decimal | string | number;
    scheduledAt?: Date | null;
    notes?: string | null;
    createdById: string | null;
    prefix?: string;
  },
): Promise<{ batchId: string; code: string }> {
  const planned = typeof params.plannedQty === "object" ? params.plannedQty : parseDecimal(String(params.plannedQty));
  await prisma.recipe.findUniqueOrThrow({ where: { id: params.recipeId }, select: { id: true } });

  const slug = crypto.randomUUID().slice(0, 6).toUpperCase();
  const code = `${params.prefix ?? "BATCH"}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${slug}`;

  const batch = await prisma.productionBatch.create({
    data: {
      code,
      recipeId: params.recipeId,
      plannedQty: planned,
      status: BatchStatus.PLANNED,
      scheduledAt: params.scheduledAt ?? null,
      notes: params.notes ?? null,
      createdById: params.createdById,
      metadata: JSON.stringify({
        seededAtIso: new Date().toISOString(),
      }),
    },
  });

  return { batchId: batch.id, code: batch.code };
}

export async function startProductionBatch(
  prisma: PrismaClient,
  params: {
    batchId: string;
    actorId: string | null;
  },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const batch = await hydrateBatchFully(tx as unknown as DbClient, params.batchId);
    if (batch.status !== BatchStatus.PLANNED) {
      throw new Error("Seuls les batches planifiés peuvent démarrer.");
    }

    const preview = await previewScaledConsumption(tx, {
      recipeId: batch.recipeId,
      producedQty: batch.plannedQty,
    });

    for (const line of preview) {
      if (line.shortageQty.gt(0)) {
        throw new Error(
          `Blocage flux : rupture prévisionnelle sur ${line.sku} (besoin brut ${decimalToString(line.grossQty)} vs stock ${decimalToString(line.warehouseQty)}).`,
        );
      }
    }

    await tx.productionBatch.update({
      where: { id: batch.id },
      data: {
        status: BatchStatus.IN_PROGRESS,
        startedAt: new Date(),
        operatorId: params.actorId,
        metadata: mergeMetadata(batch.metadata, {
          startSnapshot: preview.map((row) => ({
            rawMaterialId: row.rawMaterialId,
            sku: row.sku,
            grossQty: decimalToString(row.grossQty),
            warehouseQty: decimalToString(row.warehouseQty),
          })),
          startedIso: new Date().toISOString(),
        }),
      },
    });
  });
}

export async function cancelProductionBatch(
  prisma: PrismaClient,
  params: {
    batchId: string;
  },
): Promise<void> {
  const batch = await prisma.productionBatch.findUniqueOrThrow({ where: { id: params.batchId } });

  if (batch.status !== BatchStatus.PLANNED && batch.status !== BatchStatus.IN_PROGRESS) {
    throw new Error("Lot déjà clôturé — annulation impossible.");
  }

  await prisma.productionBatch.update({
    where: { id: batch.id },
    data: {
      status: BatchStatus.CANCELLED,
      finishedAt: new Date(),
    },
  });
}

export async function completeProductionBatch(
  prisma: PrismaClient,
  params: {
    batchId: string;
    producedQty: Decimal | string | number;
    occurredAt?: Date;
    actorId: string | null;
    laborCost?: Decimal | null;
    overheadCost?: Decimal | null;
  },
): Promise<void> {
  const produced =
    typeof params.producedQty === "object"
      ? params.producedQty
      : parseDecimal(String(params.producedQty));

  if (!produced.gt(0)) {
    throw new Error("production réelle doit être > 0.");
  }

  await prisma.$transaction(async (tx) => {
    const batch = await hydrateBatchFully(tx as unknown as DbClient, params.batchId);
    if (batch.status !== BatchStatus.IN_PROGRESS) {
      throw new Error("Lot à clôturer uniquement depuis l'état EN COURS.");
    }

    const recipeFull = await hydrateRecipeFully(tx, batch.recipeId);
    const lines = await previewScaledConsumption(tx, {
      recipeId: batch.recipeId,
      producedQty: produced,
    });

    let ingredientCostAccumulator = new Decimal(0);

    for (const line of lines) {
      if (line.shortageQty.gt(0)) {
        throw new Error(
          `Stock insuffisant pour ${line.sku} (${decimalToString(line.grossQty)} nécessaires, ${decimalToString(line.warehouseQty)} disponibles).`,
        );
      }

      ingredientCostAccumulator = ingredientCostAccumulator.add(line.lineCostIngredient);

      await postSignedMovement({
        prisma: tx as unknown as DbClient,
        materialKind: MaterialKind.RAW,
        materialId: line.rawMaterialId,
        qtySigned: line.grossQty.mul(-1),
        inventoryKind: InventoryMovementKind.PRODUCTION_OUT,
        occurredAt: params.occurredAt ?? new Date(),
        referenceType: PRODUCTION_BATCH_REF,
        referenceId: batch.id,
        note: `Fabrication batch ${batch.code} · SKU ${line.sku}`,
        userId: params.actorId ?? null,
      });
    }

    if (recipeFull.outputPackagingMaterialId && recipeFull.outputPackagingMaterial) {
      await postSignedMovement({
        prisma: tx as unknown as DbClient,
        materialKind: MaterialKind.PACKAGING,
        materialId: recipeFull.outputPackagingMaterialId,
        qtySigned: produced,
        inventoryKind: InventoryMovementKind.PRODUCTION_IN,
        occurredAt: params.occurredAt ?? new Date(),
        referenceType: PRODUCTION_BATCH_REF,
        referenceId: batch.id,
        note: `Sortie glacée (${recipeFull.outputPackagingMaterial.sku}) — batch ${batch.code}`,
        userId: params.actorId ?? null,
      });
    }

    const costLabor = params.laborCost ?? new Decimal(0);
    const costOverhead = params.overheadCost ?? new Decimal(0);
    const totalBatchCost = ingredientCostAccumulator.add(costLabor).add(costOverhead);

    await tx.productionBatch.update({
      where: { id: batch.id },
      data: {
        status: BatchStatus.COMPLETED,
        producedQty: produced,
        finishedAt: new Date(),
        costIngredientTotal: ingredientCostAccumulator,
        costLaborEstimate: costLabor.gt(0) ? costLabor : null,
        costOverheadEstimate: costOverhead.gt(0) ? costOverhead : null,
        metadata: mergeMetadata(batch.metadata, {
          closedIso: (params.occurredAt ?? new Date()).toISOString(),
          costTotalBatch: decimalToString(totalBatchCost),
          costIngredient: decimalToString(ingredientCostAccumulator),
          costPerOutputUnit:
            produced.gt(0) ? decimalToString(totalBatchCost.div(produced)) : "0",
        }),
      },
    });
  });
}

export async function registerProductionFloorWaste(
  prisma: PrismaClient,
  params: {
    batchId?: string | null;
    rawMaterialId: string;
    qtyLost: Decimal | string | number;
    reason?: string | null;
    actorId: string | null;
    inventoryKind?: InventoryMovementKind;
  },
): Promise<void> {
  const qty =
    typeof params.qtyLost === "object"
      ? params.qtyLost
      : parseDecimal(String(params.qtyLost));

  if (!qty.gt(0)) throw new Error("quantité déchet doit être strictement positive.");

  const inventoryKind =
    params.inventoryKind === InventoryMovementKind.DAMAGED_LOSS
      ? InventoryMovementKind.DAMAGED_LOSS
      : InventoryMovementKind.PRODUCTION_WASTE;

  await prisma.$transaction(async (tx) => {
    await tx.rawMaterial.findUniqueOrThrow({ where: { id: params.rawMaterialId } });

    await postSignedMovement({
      prisma: tx as unknown as DbClient,
      materialKind: MaterialKind.RAW,
      materialId: params.rawMaterialId,
      qtySigned: qty.mul(-1),
      inventoryKind,
      referenceType: params.batchId ? PRODUCTION_BATCH_REF : "ManualProductionLoss",
      referenceId: params.batchId ?? null,
      note: params.reason ?? "Perte chantier crémerie.",
      userId: params.actorId ?? null,
    });
  });
}

export type ProductionDashboardComputation = {
  activeBatches: number;
  todayCompletedKg: Decimal;
};

export async function computeProductionSignals(prisma: PrismaClient): Promise<ProductionDashboardComputation> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [activeCount, completions] = await Promise.all([
    prisma.productionBatch.count({
      where: { status: { in: [BatchStatus.PLANNED, BatchStatus.IN_PROGRESS] } },
    }),
    prisma.productionBatch.findMany({
      where: {
        status: BatchStatus.COMPLETED,
        finishedAt: { gte: start },
      },
      select: { producedQty: true },
    }),
  ]);

  let todayTotals = new Decimal(0);
  completions.forEach((row) => {
    if (row.producedQty) {
      todayTotals = todayTotals.add(row.producedQty);
    }
  });

  return {
    activeBatches: activeCount,
    todayCompletedKg: todayTotals,
  };
}
