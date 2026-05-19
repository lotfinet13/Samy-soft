import { ipcMain } from "electron";
import { InventoryMovementKind } from "../prisma-client.js";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import {
  mixerLogListSchema,
  productionBatchCompleteSchema,
  productionBatchCreateSchema,
  productionBatchLifecycleSchema,
  productionBatchListSchema,
  productionOperationLogCreateSchema,
  productionRecipeDuplicateSchema,
  productionRecipeIngredientsReplaceSchema,
  productionRecipeSearchSchema,
  productionRecipeUpsertSchema,
  productionShortagePreviewSchema,
  productionWasteRegisterSchema,
} from "../../shared/schemas/production.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { getPrisma } from "../database.js";
import { logActivity } from "../services/activity-service.js";
import { resolveSessionUser, sessionHasPermission } from "../services/auth-service.js";
import {
  decimalToString,
  parseDecimal,
} from "../services/inventory-service.js";
import { toIpcPayload } from "../utils/serialize-for-ipc.js";
import {
  computeProductionSignals,
  completeProductionBatch,
  duplicateRecipeFabric,
  persistRecipeMetadata,
  previewScaledConsumption,
  registerProductionFloorWaste,
  seedProductionBatch,
  startProductionBatch,
  syncRecipeIngredientLines,
  cancelProductionBatch,
} from "../services/production-service.js";

type SessionUserResolved = Exclude<Awaited<ReturnType<typeof resolveSessionUser>>, null>;

async function requireAuthUser(): Promise<SessionUserResolved> {
  const prisma = getPrisma();
  const user = await resolveSessionUser(prisma);
  if (!user) throw new Error("Non authentifié.");
  return user;
}

function enforcePermission(user: SessionUserResolved, permission: string | readonly string[]): void {
  if (!sessionHasPermission(user.role.permissions, permission)) {
    throw new Error("Permission refusée.");
  }
}

function csvEscape(value: string): string {
  const needsQuotes = /[;"\r\n]+/.test(value);
  const escaped = value.replaceAll('"', '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function csvFromRows(headers: string[], rows: Array<Array<string>>): string {
  const head = headers.map(csvEscape).join(";");
  const body = rows.map((row) => row.map(csvEscape).join(";")).join("\r\n");
  return `${head}\r\n${body}`;
}

function readCostSnapshot(metadataRaw: string): string {
  try {
    const obj = JSON.parse(metadataRaw ?? "{}") as Record<string, unknown>;
    const value = obj.costPerOutputUnit;
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

/** IPC-safe recipe metadata after create/update/duplicate (no Prisma.Decimal / Date). */
function serializeRecipeMeta(recipe: {
  id: string;
  code: string;
  labelFr: string;
  category: string | null;
  description: string | null;
  productionNotes: string | null;
  yieldQty: unknown;
  yieldUnit: string;
  estimatedMinutes: number | null;
  recipeVersion: number | null;
  isActive: boolean;
  parentRecipeId: string | null;
  outputPackagingMaterialId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: recipe.id,
    code: recipe.code,
    labelFr: recipe.labelFr,
    category: recipe.category,
    description: recipe.description,
    productionNotes: recipe.productionNotes,
    yieldQtySerialized: decimalToString(recipe.yieldQty),
    yieldUnit: recipe.yieldUnit,
    estimatedMinutes: recipe.estimatedMinutes,
    recipeVersion: recipe.recipeVersion,
    isActive: recipe.isActive,
    parentRecipeId: recipe.parentRecipeId,
    outputPackagingMaterialId: recipe.outputPackagingMaterialId,
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
  };
}

export function registerProductionHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_NAV_COUNTS, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_READ);

    const startMixer = new Date();
    startMixer.setHours(0, 0, 0, 0);

    const [signals, activeRecipesMonitored, cycleLogsToday] = await Promise.all([
      computeProductionSignals(prisma),
      prisma.recipe.count({ where: { isActive: true } }),
      prisma.productionOperationLog.count({
        where: { startedAt: { gte: startMixer } },
      }),
    ]);

    return {
      activeRecipes: activeRecipesMonitored,
      mixerCyclesToday: cycleLogsToday,
      activeBatches: signals.activeBatches,
      throughputTodaySerialized: decimalToString(signals.todayCompletedKg),
    };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_RECIPE_LIST, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_READ);

    const filters = productionRecipeSearchSchema.parse(payload ?? {});
    const where: Record<string, unknown> = {};
    const term = filters.q.trim();

    if (!filters.includeInactive) {
      where.isActive = true;
    }

    const category = filters.category.trim();
    if (category.length) {
      where.category = category;
    }

    if (term.length > 0) {
      where.OR = [{ code: { contains: term } }, { labelFr: { contains: term } }];
    }

    const [total, recipes] = await prisma.$transaction([
      prisma.recipe.count({ where }),
      prisma.recipe.findMany({
        where,
        orderBy: { code: "asc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: {
          ingredients: true,
          _count: {
            select: { batches: true },
          },
        },
      }),
    ]);

    const items = recipes.map((recipe) => ({
      id: recipe.id,
      code: recipe.code,
      labelFr: recipe.labelFr,
      category: recipe.category,
      yieldQtySerialized: decimalToString(recipe.yieldQty),
      yieldUnit: recipe.yieldUnit,
      ingredientCount: recipe.ingredients.length,
      batchUses: recipe._count.batches,
      isActive: recipe.isActive,
      estimatedMinutes: recipe.estimatedMinutes,
      recipeVersion: recipe.recipeVersion,
    }));

    return { total, page: filters.page, pageSize: filters.pageSize, items };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_RECIPE_GET, async (_evt, recipeId?: string) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_READ);

    const id = String(recipeId ?? "").trim();
    if (!id) throw new Error("Recette manquante.");

    const recipe = await prisma.recipe.findUniqueOrThrow({
      where: { id },
      include: {
        ingredients: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: {
            rawMaterial: true,
          },
        },
        outputPackagingMaterial: true,
      },
    });

    const ingredientsSerialized = recipe.ingredients.map((line) => ({
      id: line.id,
      recipeId: line.recipeId,
      rawMaterialId: line.rawMaterialId,
      sku: line.rawMaterial.sku,
      labelFr: line.rawMaterial.labelFr,
      quantitySerialized: decimalToString(line.quantity),
      wastePctSerialized: decimalToString(line.wastePct),
      unit: line.unit,
      optionalIngredient: line.optionalIngredient,
      sortOrder: line.sortOrder,
      note: line.note,
    }));

    return {
      id: recipe.id,
      code: recipe.code,
      labelFr: recipe.labelFr,
      category: recipe.category,
      description: recipe.description,
      productionNotes: recipe.productionNotes,
      yieldQtySerialized: decimalToString(recipe.yieldQty),
      yieldUnit: recipe.yieldUnit,
      estimatedMinutes: recipe.estimatedMinutes,
      recipeVersion: recipe.recipeVersion,
      isActive: recipe.isActive,
      parentRecipeId: recipe.parentRecipeId,
      outputPackagingMaterialId: recipe.outputPackagingMaterialId,
      outputPackagingSku: recipe.outputPackagingMaterial?.sku ?? null,
      ingredients: ingredientsSerialized,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_RECIPE_UPSERT, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_WRITE);

    const dto = productionRecipeUpsertSchema.parse(payload);
    const persisted = await persistRecipeMetadata(prisma, {
      id: dto.id,
      code: dto.code,
      labelFr: dto.labelFr,
      category: dto.category ?? null,
      description: dto.description ?? null,
      productionNotes: dto.productionNotes ?? null,
      yieldQty: parseDecimal(String(dto.yieldQty)),
      yieldUnit: dto.yieldUnit,
      estimatedMinutes: dto.estimatedMinutes ?? null,
      isActive: dto.isActive,
      recipeVersion: dto.recipeVersion ?? null,
      parentRecipeId: dto.parentRecipeId ?? null,
      outputPackagingMaterialId: dto.outputPackagingMaterialId ?? null,
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "PRODUCTION_RECIPE_UPSERT",
      entityType: "recipe",
      entityId: persisted.id,
      metadata: { code: persisted.code },
    });

    return toIpcPayload(serializeRecipeMeta(persisted), IPC_CHANNELS.PRODUCTION_RECIPE_UPSERT);
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_RECIPE_INGREDIENTS_REPLACE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_WRITE);

    const dto = productionRecipeIngredientsReplaceSchema.parse(payload);
    const refreshed = await syncRecipeIngredientLines(prisma, {
      recipeId: dto.recipeId,
      lines: dto.lines.map((line) => ({
        rawMaterialId: line.rawMaterialId,
        quantity: parseDecimal(line.quantity),
        unit: line.unit,
        optionalIngredient: line.optionalIngredient,
        wastePct:
          line.wastePct == null
            ? undefined
            : typeof line.wastePct === "number"
              ? line.wastePct
              : Number(line.wastePct),
        sortOrder: line.sortOrder,
        note: line.note ?? undefined,
      })),
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "PRODUCTION_RECIPE_INGREDIENTS",
      entityType: "recipe",
      entityId: dto.recipeId,
      metadata: { count: refreshed },
    });

    return { count: refreshed };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_RECIPE_DUPLICATE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_WRITE);

    const dto = productionRecipeDuplicateSchema.parse(payload);
    const cloned = await duplicateRecipeFabric(prisma, {
      recipeId: dto.recipeId,
      newCode: dto.newCode ?? null,
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "PRODUCTION_RECIPE_DUPLICATE",
      entityType: "recipe",
      entityId: cloned.id,
      metadata: { source: dto.recipeId },
    });

    return toIpcPayload(serializeRecipeMeta(cloned), IPC_CHANNELS.PRODUCTION_RECIPE_DUPLICATE);
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_PREVIEW_SHORTAGES, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_READ);

    const dto = productionShortagePreviewSchema.parse(payload);
    const lines = await previewScaledConsumption(prisma, {
      recipeId: dto.recipeId,
      producedQty: parseDecimal(String(dto.targetQty)),
    });

    const shortages = lines
      .filter((line) => line.shortageQty.gt(0))
      .map((line) => ({
        rawMaterialId: line.rawMaterialId,
        sku: line.sku,
        labelFr: line.labelFr,
        neededSerialized: decimalToString(line.grossQty),
        warehouseSerialized: decimalToString(line.warehouseQty),
        shortageSerialized: decimalToString(line.shortageQty),
      }));

    return { shortages };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BATCH_CREATE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_EXECUTE);

    const dto = productionBatchCreateSchema.parse(payload);
    const occurrence = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    const { batchId, code } = await seedProductionBatch(prisma, {
      recipeId: dto.recipeId,
      plannedQty: parseDecimal(String(dto.plannedQty)),
      scheduledAt: occurrence,
      notes: dto.notes ?? null,
      createdById: user.id,
    });

    if (dto.operatorId) {
      await prisma.productionBatch.update({
        where: { id: batchId },
        data: {
          operatorId: dto.operatorId,
        },
      });
    }

    await logActivity(prisma, {
      userId: user.id,
      action: "PRODUCTION_BATCH_CREATE",
      entityType: "production_batch",
      entityId: batchId,
      metadata: { code },
    });

    return { batchId, code };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BATCH_LIST, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_READ);

    const filters = productionBatchListSchema.parse(payload ?? {});
    const clauses: Record<string, unknown>[] = [];
    if (filters.status) clauses.push({ status: filters.status });
    if (filters.recipeId) clauses.push({ recipeId: filters.recipeId });
    const term = filters.q?.trim();
    if (term && term.length > 0) {
      clauses.push({
        OR: [
          { code: { contains: term } },
          {
            recipe: {
              OR: [{ code: { contains: term } }, { labelFr: { contains: term } }],
            },
          },
        ],
      });
    }
    const where = clauses.length ? { AND: clauses } : {};

    const [total, rows] = await prisma.$transaction([
      prisma.productionBatch.count({ where }),
      prisma.productionBatch.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
        include: {
          recipe: true,
          createdBy: { select: { displayName: true, username: true } },
          operator: { select: { displayName: true, username: true } },
        },
      }),
    ]);

    return {
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      items: rows.map((batch) => ({
        id: batch.id,
        code: batch.code,
        status: batch.status,
        recipeCode: batch.recipe.code,
        recipeLabel: batch.recipe.labelFr,
        plannedQtySerialized: decimalToString(batch.plannedQty),
        producedQtySerialized: batch.producedQty ? decimalToString(batch.producedQty) : null,
        scheduledAt: batch.scheduledAt ? batch.scheduledAt.toISOString() : null,
        startedAt: batch.startedAt ? batch.startedAt.toISOString() : null,
        finishedAt: batch.finishedAt ? batch.finishedAt.toISOString() : null,
        ingredientCostSerialized: batch.costIngredientTotal ? decimalToString(batch.costIngredientTotal) : null,
        costUnitSnapshotSerialized: readCostSnapshot(batch.metadata),
        creator: batch.createdBy?.displayName ?? batch.createdBy?.username ?? "—",
        operator: batch.operator?.displayName ?? batch.operator?.username ?? null,
      })),
    };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BATCH_GET, async (_evt, batchId?: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_READ);

    const id = String(batchId ?? "").trim();
    if (!id) throw new Error("Lot invalide.");

    const batch = await prisma.productionBatch.findUniqueOrThrow({
      where: { id },
      include: {
        recipe: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
        operator: { select: { id: true, displayName: true, username: true } },
        operationLogs: { orderBy: { startedAt: "desc" } },
      },
    });

    return {
      id: batch.id,
      code: batch.code,
      status: batch.status,
      metadata: batch.metadata,
      plannedQtySerialized: decimalToString(batch.plannedQty),
      producedQtySerialized: batch.producedQty ? decimalToString(batch.producedQty) : null,
      ingredientCostSerialized: batch.costIngredientTotal ? decimalToString(batch.costIngredientTotal) : null,
      laborSerialized: batch.costLaborEstimate ? decimalToString(batch.costLaborEstimate) : null,
      overheadSerialized: batch.costOverheadEstimate ? decimalToString(batch.costOverheadEstimate) : null,
      scheduledAt: batch.scheduledAt ? batch.scheduledAt.toISOString() : null,
      startedAt: batch.startedAt ? batch.startedAt.toISOString() : null,
      finishedAt: batch.finishedAt ? batch.finishedAt.toISOString() : null,
      notes: batch.notes,
      recipeId: batch.recipeId,
      recipe: {
        id: batch.recipe.id,
        code: batch.recipe.code,
        labelFr: batch.recipe.labelFr,
        yieldQtySerialized: decimalToString(batch.recipe.yieldQty),
        yieldUnit: batch.recipe.yieldUnit,
        outputPackagingMaterialId: batch.recipe.outputPackagingMaterialId,
      },
      createdBy:
        batch.createdBy != null
          ? {
              id: batch.createdBy.id,
              displayName: batch.createdBy.displayName,
              username: batch.createdBy.username,
            }
          : null,
      operator:
        batch.operator != null
          ? {
              id: batch.operator.id,
              displayName: batch.operator.displayName,
              username: batch.operator.username,
            }
          : null,
      operationLogs: batch.operationLogs.map((row) => ({
        id: row.id,
        mixerCode: row.mixerCode,
        runtimeMinutes: row.runtimeMinutes,
        cleaningDone: row.cleaningDone,
        maintenanceNeeded: row.maintenanceNeeded,
        startedAtISO: row.startedAt.toISOString(),
        endedAtISO: row.endedAt ? row.endedAt.toISOString() : null,
        notesPreview: row.notes?.slice(0, 240) ?? "",
      })),
      createdAtISO: batch.createdAt.toISOString(),
      updatedAtISO: batch.updatedAt.toISOString(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BATCH_START, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_EXECUTE);

    const dto = productionBatchLifecycleSchema.parse(payload);
    await startProductionBatch(prisma, { batchId: dto.batchId, actorId: user.id });

    await logActivity(prisma, {
      userId: user.id,
      action: "PRODUCTION_BATCH_START",
      entityType: "production_batch",
      entityId: dto.batchId,
    });

    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BATCH_COMPLETE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_EXECUTE);

    const dto = productionBatchCompleteSchema.parse(payload);

    const adjustCostsAllowed = sessionHasPermission(user.role.permissions, PERMISSIONS.PRODUCTION_ADJUST_COST);

    const labor =
      dto.laborCostEstimate && adjustCostsAllowed ? parseDecimal(String(dto.laborCostEstimate)) : undefined;
    const overhead =
      dto.overheadCostEstimate && adjustCostsAllowed ? parseDecimal(String(dto.overheadCostEstimate)) : undefined;

    await completeProductionBatch(prisma, {
      batchId: dto.batchId,
      producedQty: parseDecimal(String(dto.producedQty)),
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      actorId: user.id,
      laborCost: labor,
      overheadCost: overhead,
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "PRODUCTION_BATCH_COMPLETE",
      entityType: "production_batch",
      entityId: dto.batchId,
    });

    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BATCH_CANCEL, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_EXECUTE);

    const dto = productionBatchLifecycleSchema.parse(payload);
    await cancelProductionBatch(prisma, { batchId: dto.batchId });

    await logActivity(prisma, {
      userId: user.id,
      action: "PRODUCTION_BATCH_CANCEL",
      entityType: "production_batch",
      entityId: dto.batchId,
    });

    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_REGISTER_WASTE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_EXECUTE);

    const dto = productionWasteRegisterSchema.parse(payload);
    const mappedKind =
      dto.inventoryKind === "DAMAGED_LOSS"
        ? InventoryMovementKind.DAMAGED_LOSS
        : InventoryMovementKind.PRODUCTION_WASTE;

    await registerProductionFloorWaste(prisma, {
      batchId: dto.batchId ?? null,
      rawMaterialId: dto.rawMaterialId,
      qtyLost: parseDecimal(String(dto.qtyLost)),
      reason: dto.note ?? null,
      actorId: user.id,
      inventoryKind: mappedKind,
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "PRODUCTION_REGISTER_WASTE",
      entityType: "production_batch",
      entityId: dto.batchId ?? "freeform",
      metadata: { sku: dto.rawMaterialId },
    });

    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_OPERATION_LOG_CREATE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_EXECUTE);

    const dto = productionOperationLogCreateSchema.parse(payload);

    await prisma.productionOperationLog.create({
      data: {
        batchId: dto.batchId ?? null,
        mixerCode: dto.mixerCode ?? null,
        runtimeMinutes: dto.runtimeMinutes ?? null,
        cleaningDone: dto.cleaningDone ?? false,
        cleaningNotes: dto.cleaningNotes ?? null,
        maintenanceNeeded: dto.maintenanceNeeded ?? false,
        maintenanceNotes: dto.maintenanceNotes ?? null,
        notes: dto.notes ?? null,
        operatorId: user.id,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date(),
        endedAt: dto.endedAt ? new Date(dto.endedAt) : null,
      },
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "PRODUCTION_OPERATION_LOG_CREATE",
      entityType: "production_mixer",
      metadata: {
        mixer: dto.mixerCode ?? "",
        batchId: dto.batchId ?? "",
      },
    });

    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_OPERATION_LOG_LIST, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_READ);

    const filters = mixerLogListSchema.parse(payload ?? {});
    const where: Record<string, unknown> = {};
    const mixerTerm = filters.mixerCode.trim();
    if (mixerTerm.length > 0) {
      where.mixerCode = { contains: mixerTerm };
    }

    if (filters.batchId) {
      where.batchId = filters.batchId;
    }

    const [total, logs] = await prisma.$transaction([
      prisma.productionOperationLog.count({ where }),
      prisma.productionOperationLog.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: {
          operator: { select: { displayName: true, username: true } },
          batch: true,
        },
      }),
    ]);

    return {
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      items: logs.map((row) => ({
        id: row.id,
        batchCode: row.batch?.code ?? "—",
        mixerCode: row.mixerCode,
        runtimeMinutes: row.runtimeMinutes,
        cleaningDone: row.cleaningDone,
        maintenanceNeeded: row.maintenanceNeeded,
        operator: row.operator?.displayName ?? row.operator?.username ?? "—",
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt ? row.endedAt.toISOString() : null,
        notesPreview: row.notes?.slice(0, 240) ?? "",
      })),
    };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_DASHBOARD_SUMMARY, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_READ);

    const [signals, running, recentCompletes] = await Promise.all([
      computeProductionSignals(prisma),
      prisma.productionBatch.findMany({
        where: { status: { in: ["PLANNED", "IN_PROGRESS"] } },
        include: {
          recipe: true,
          operator: { select: { displayName: true, username: true } },
          createdBy: { select: { displayName: true, username: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.productionBatch.findMany({
        where: { status: "COMPLETED" },
        include: {
          recipe: true,
          operator: { select: { displayName: true, username: true } },
        },
        orderBy: { finishedAt: "desc" },
        take: 10,
      }),
    ]);

    const wasteMovements = await prisma.stockMovement.findMany({
      where: {
        inventoryKind: InventoryMovementKind.PRODUCTION_WASTE,
      },
      orderBy: { occurredAt: "desc" },
      take: 30,
      include: {
        rawMaterial: true,
      },
    });

    return {
      activeBatches: signals.activeBatches,
      throughputTodaySerialized: decimalToString(signals.todayCompletedKg),
      runningPanels: running.map((batch) => ({
        code: batch.code,
        recipe: batch.recipe.labelFr,
        status: batch.status,
        plannedQtySerialized: decimalToString(batch.plannedQty),
        assignee:
          batch.operator?.displayName ??
          batch.operator?.username ??
          batch.createdBy?.displayName ??
          batch.createdBy?.username ??
          "À affecter",
      })),
      latestCompleted: recentCompletes.map((batch) => ({
        code: batch.code,
        recipe: batch.recipe.labelFr,
        producedQtySerialized: batch.producedQty ? decimalToString(batch.producedQty) : "",
        ingredientCostSerialized: batch.costIngredientTotal ? decimalToString(batch.costIngredientTotal) : "",
        finishedAt: batch.finishedAt ? batch.finishedAt.toISOString() : null,
      })),
      wasteAlerts: wasteMovements.map((movement) => ({
        sku: movement.rawMaterial?.sku ?? "—",
        qtySignedSerialized: decimalToString(movement.qtySigned),
        occurredIso: movement.occurredAt.toISOString(),
        note: movement.note ?? "",
      })),
    };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_REPORT_BATCHES_CSV, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_REPORT);

    const rows = await prisma.productionBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 3500,
      include: {
        recipe: true,
      },
    });

    const data = rows.map((row) => [
      row.code,
      row.status,
      row.recipe.code,
      decimalToString(row.plannedQty),
      row.producedQty ? decimalToString(row.producedQty) : "",
      decimalToString(row.costIngredientTotal ?? 0),
      row.startedAt ? row.startedAt.toISOString() : "",
      row.finishedAt ? row.finishedAt.toISOString() : "",
    ]);

    const headers = ["Lot", "Statut", "Recette plan", "Planifiée", "Produite", "Coût MP", "Début", "Fin"];
    return { csv: csvFromRows(headers, data) };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_REPORT_CONSUMPTION_CSV, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_REPORT);

    const rows = await prisma.stockMovement.findMany({
      where: {
        inventoryKind: InventoryMovementKind.PRODUCTION_OUT,
      },
      orderBy: { occurredAt: "desc" },
      take: 6500,
      include: {
        rawMaterial: true,
      },
    });

    const data = rows.map((row) => [
      row.referenceId ?? "",
      row.rawMaterial?.sku ?? "",
      row.rawMaterial?.labelFr ?? "",
      decimalToString(row.qtySigned),
      row.occurredAt.toISOString(),
      row.note ?? "",
    ]);

    const headers = ["LotRéf UUID", "SKU", "Article", "Delta signé", "Date mouvement", "Note"];

    return { csv: csvFromRows(headers, data) };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_REPORT_COSTS_CSV, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_REPORT);

    const rows = await prisma.productionBatch.findMany({
      where: {
        status: "COMPLETED",
      },
      orderBy: { finishedAt: "desc" },
      take: 2000,
      include: {
        recipe: true,
      },
    });

    const data = rows.map((row) => {
      const qty = row.producedQty ?? row.plannedQty;
      let costUnit = "";

      try {
        if (row.costIngredientTotal && qty && parseDecimal(decimalToString(qty)).gt(0)) {
          costUnit = decimalToString(row.costIngredientTotal.div(parseDecimal(decimalToString(qty))));
        }
      } catch {
        costUnit = "";
      }

      return [
        row.code,
        decimalToString(row.costIngredientTotal ?? 0),
        decimalToString(qty ?? 0),
        costUnit,
        row.costLaborEstimate ? decimalToString(row.costLaborEstimate) : "",
        row.costOverheadEstimate ? decimalToString(row.costOverheadEstimate) : "",
        row.metadata,
      ];
    });

    const headers = ["Lot", "Coût MP", "Volume produit", "Coût unitaire snapshot", "MS main établie", "Frais généraux", "Payload JSON"];

    return { csv: csvFromRows(headers, data) };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_REPORT_WASTE_CSV, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PRODUCTION_REPORT);

    const rows = await prisma.stockMovement.findMany({
      where: {
        inventoryKind: {
          in: [InventoryMovementKind.PRODUCTION_WASTE, InventoryMovementKind.DAMAGED_LOSS],
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 6500,
      include: {
        rawMaterial: true,
      },
    });

    const data = rows.map((row) => [
      row.inventoryKind,
      row.rawMaterial?.sku ?? "",
      row.rawMaterial?.labelFr ?? "",
      decimalToString(row.qtySigned),
      row.referenceId ?? "",
      row.referenceType ?? "",
      row.occurredAt.toISOString(),
      row.note ?? "",
    ]);

    const headers = ["Nature", "SKU", "Article", "Delta signé", "Référence", "Type réf.", "Instant", "Note"];

    return { csv: csvFromRows(headers, data) };
  });
}
