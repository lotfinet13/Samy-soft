import { ipcMain } from "electron";
import { MaterialKind } from "../prisma-client.js";

import { InventoryMovementKind, Prisma } from "../prisma-client.js";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import {
  inboundMovementSchema,
  inventorySearchSchema,
  manualAdjustmentSchema,
  outboundMovementSchema,
  pagingSchema,
  supplierListSchema,
  packagingUpsertSchema,
  purchaseCreateSchema,
  rawMaterialUpsertSchema,
  supplierUpsertSchema,
} from "../../shared/schemas/inventory.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { getPrisma } from "../database.js";
import { logActivity } from "../services/activity-service.js";
import { resolveSessionUser, sessionHasPermission } from "../services/auth-service.js";
import {
  toInventoryMaterialListItemDto,
  toPurchaseEntryListItemDto,
  toSupplierDetailDto,
  toSupplierListItemDto,
} from "./dto/inventory-dto.js";
import { toIpcPayload } from "../utils/serialize-for-ipc.js";
import {
  createPurchaseEntryLedger,
  decimalToString,
  getCurrentQty,
  parseDecimal,
  postSignedMovement,
} from "../services/inventory-service.js";

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

async function hydrateRawBalances(
  rows: Array<Parameters<typeof toInventoryMaterialListItemDto>[0]>,
) {
  const prisma = getPrisma();
  return Promise.all(
    rows.map(async (row) => {
      const currentQty = await getCurrentQty(prisma, MaterialKind.RAW, row.id);
      const minimum = parseDecimal(decimalToString(row.minimumStockQty));
      return toInventoryMaterialListItemDto(row, {
        currentQtySerialized: decimalToString(currentQty),
        isLowStock: currentQty.lessThan(minimum),
      });
    }),
  );
}

async function hydratePackBalances(
  rows: Array<Parameters<typeof toInventoryMaterialListItemDto>[0]>,
) {
  const prisma = getPrisma();
  return Promise.all(
    rows.map(async (row) => {
      const currentQty = await getCurrentQty(prisma, MaterialKind.PACKAGING, row.id);
      const minimum = parseDecimal(decimalToString(row.minimumStockQty));
      return toInventoryMaterialListItemDto(row, {
        currentQtySerialized: decimalToString(currentQty),
        isLowStock: currentQty.lessThan(minimum),
      });
    }),
  );
}

/** SQLite `contains` is case-sensitive; emit OR variants so `ing` matches `ING002`. */
function searchTermCaseVariants(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  const titleCased =
    lower.length > 0 ? `${lower.charAt(0).toUpperCase()}${lower.slice(1)}` : lower;
  return [...new Set([trimmed, lower, upper, titleCased])];
}

function buildTextSearchOrClause(term: string): { OR: Prisma.RawMaterialWhereInput[] } {
  const variants = searchTermCaseVariants(term);
  const or: Prisma.RawMaterialWhereInput[] = [];
  for (const variant of variants) {
    or.push(
      { sku: { contains: variant } },
      { labelFr: { contains: variant } },
      { category: { contains: variant } },
    );
  }
  return { OR: or };
}

function buildFlexibleSearchWhere(
  table: "raw" | "packaging",
  opts: {
    includeInactive?: boolean;
    supplierId?: string | undefined;
    category?: string | undefined;
    q?: string | undefined;
  },
): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];

  const includeInactive = opts.includeInactive === true ? true : undefined;
  if (!includeInactive) {
    clauses.push({ isActive: true });
  }
  if (opts.supplierId) {
    clauses.push({ supplierId: opts.supplierId });
  }
  if (opts.category && opts.category.trim().length > 0) {
    clauses.push({ category: opts.category.trim() });
  }

  const term = (opts.q ?? "").trim();
  if (term.length > 0) {
    clauses.push(buildTextSearchOrClause(term));
  }

  if (table === "raw") {
    return clauses.length ? { AND: clauses } : {};
  }

  return clauses.length ? { AND: clauses } : {};
}

function serializeMovementScalars(movement: {
  id: string;
  materialKind: string;
  inventoryKind: string;
  qtyBefore: unknown;
  qtyAfter: unknown;
  qtySigned: unknown;
  referenceType?: string | null;
  referenceId?: string | null;
  occurredAt: Date;
  createdAt: Date;
  note?: string | null;
  expiresAt?: Date | null;
}) {
  return {
    id: movement.id,
    materialKind: movement.materialKind,
    inventoryKind: movement.inventoryKind,
    qtyBeforeSerialized: decimalToString(movement.qtyBefore),
    qtyAfterSerialized: decimalToString(movement.qtyAfter),
    qtySignedSerialized: decimalToString(movement.qtySigned),
    referenceType: movement.referenceType ?? null,
    referenceId: movement.referenceId ?? null,
    note: movement.note ?? null,
    expiresAtISO: movement.expiresAt ? movement.expiresAt.toISOString() : null,
    occurredAtISO: movement.occurredAt.toISOString(),
    createdAtISO: movement.createdAt.toISOString(),
  };
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

export function registerInventoryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.INVENTORY_NAV_COUNTS, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_READ);

    const [rawMaterials, packaging] = await Promise.all([
      prisma.rawMaterial.findMany({ where: { isActive: true } }),
      prisma.packagingMaterial.findMany({ where: { isActive: true } }),
    ]);

    let lowStock = 0;
    for (const row of await hydrateRawBalances(rawMaterials)) {
      if (row.isLowStock) lowStock++;
    }

    for (const row of await hydratePackBalances(packaging)) {
      if (row.isLowStock) lowStock++;
    }

    const now = Date.now();
    const soon = now + 1000 * 60 * 60 * 24 * 45;

    const expiring = await prisma.stockMovement.count({
      where: {
        expiresAt: { not: null, lte: new Date(soon), gte: new Date(now) },
        inventoryKind: InventoryMovementKind.PURCHASE_IN,
      },
    });

    return toIpcPayload({ lowStock, expiringLines: expiring }, IPC_CHANNELS.INVENTORY_NAV_COUNTS);
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_RAW_LIST, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_READ);
    const filters = inventorySearchSchema.parse(payload ?? {});

    const where = buildFlexibleSearchWhere("raw", {
      includeInactive: filters.includeInactive,
      supplierId: filters.supplierId,
      category: filters.category,
      q: filters.q,
    }) as Prisma.RawMaterialWhereInput;

    const [total, rows] = await prisma.$transaction([
      prisma.rawMaterial.count({ where }),
      prisma.rawMaterial.findMany({
        where,
        include: { supplier: true },
        orderBy: { sku: "asc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
    ]);

    const hydrated = await hydrateRawBalances(rows);

    return {
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      items: hydrated,
    };
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_RAW_UPSERT, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_WRITE);

    const dto = rawMaterialUpsertSchema.parse(payload);
    let id = dto.id;

    const data = {
      sku: dto.sku.trim(),
      labelFr: dto.labelFr.trim(),
      category: dto.category?.trim().length ? dto.category.trim() : null,
      unit: dto.unit,
      minimumStockQty: parseDecimal(dto.minimumStockQty),
      costPriceUnit: parseDecimal(dto.costPriceUnit),
      expirationTracking: dto.expirationTracking,
      expiryWarningDays: dto.expiryWarningDays ?? null,
      notes: dto.notes?.trim().length ? dto.notes.trim() : null,
      isActive: dto.isActive,
      supplierId: dto.supplierId ?? null,
    };

    if (!id) {
      const created = await prisma.rawMaterial.create({ data });
      id = created.id;
    } else {
      await prisma.rawMaterial.update({ where: { id }, data });
    }

    await logActivity(prisma, {
      userId: user.id,
      action: "INVENTORY_RAW_UPSERT",
      entityType: "raw_material",
      entityId: id,
      metadata: { sku: data.sku },
    });

    const row = await prisma.rawMaterial.findUniqueOrThrow({
      where: { id },
      include: { supplier: true },
    });

    const hydratedRow = await hydrateRawBalances([row]).then((r) => r[0]);
    return hydratedRow;
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_PACKAGING_LIST, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_READ);

    const filters = inventorySearchSchema.parse(payload ?? {});

    const where = buildFlexibleSearchWhere("packaging", {
      includeInactive: filters.includeInactive,
      supplierId: filters.supplierId,
      category: filters.category,
      q: filters.q,
    }) as Prisma.PackagingMaterialWhereInput;

    const [total, rows] = await prisma.$transaction([
      prisma.packagingMaterial.count({ where }),
      prisma.packagingMaterial.findMany({
        where,
        include: { supplier: true },
        orderBy: { sku: "asc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
    ]);

    const hydrated = await hydratePackBalances(rows);
    return toIpcPayload(
      { total, page: filters.page, pageSize: filters.pageSize, items: hydrated },
      IPC_CHANNELS.INVENTORY_PACKAGING_LIST,
    );
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_PACKAGING_UPSERT, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_WRITE);

    const dto = packagingUpsertSchema.parse(payload);
    let id = dto.id;

    const data = {
      sku: dto.sku.trim(),
      labelFr: dto.labelFr.trim(),
      category: dto.category?.trim().length ? dto.category.trim() : null,
      unit: dto.unit,
      minimumStockQty: parseDecimal(dto.minimumStockQty),
      costPriceUnit: parseDecimal(dto.costPriceUnit),
      expirationTracking: dto.expirationTracking,
      expiryWarningDays: dto.expiryWarningDays ?? null,
      notes: dto.notes?.trim().length ? dto.notes.trim() : null,
      isActive: dto.isActive,
      supplierId: dto.supplierId ?? null,
    };

    if (!id) {
      const created = await prisma.packagingMaterial.create({ data });
      id = created.id;
    } else {
      await prisma.packagingMaterial.update({ where: { id }, data });
    }

    await logActivity(prisma, {
      userId: user.id,
      action: "INVENTORY_PACKAGING_UPSERT",
      entityType: "packaging_material",
      entityId: id,
      metadata: { sku: data.sku },
    });

    const row = await prisma.packagingMaterial.findUniqueOrThrow({
      where: { id },
      include: { supplier: true },
    });

    const hydratedRow = await hydratePackBalances([row]).then((r) => r[0]);
    return hydratedRow;
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_SUPPLIER_LIST, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_READ);
    const paging = supplierListSchema.parse(payload ?? {});
    const q = paging.q.trim();
    const where = q.length > 0 ? { name: { contains: q } } : {};
    const [total, suppliers] = await prisma.$transaction([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: {
              purchases: true,
              rawMaterials: true,
              packagingMaterials: true,
            },
          },
        },
      }),
    ]);

    return toIpcPayload(
      {
        items: suppliers.map(toSupplierListItemDto),
        total,
        page: paging.page,
        pageSize: paging.pageSize,
      },
      IPC_CHANNELS.INVENTORY_SUPPLIER_LIST,
    );
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_SUPPLIER_UPSERT, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_WRITE);

    const dto = supplierUpsertSchema.parse(payload);
    let id = dto.id;

    const data = {
      name: dto.name.trim(),
      contactName: dto.contactName ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      address: dto.address ?? null,
      notes: dto.notes ?? null,
      isActive: dto.isActive,
    };

    if (!id) {
      const created = await prisma.supplier.create({ data });
      id = created.id;
    } else {
      await prisma.supplier.update({ where: { id }, data });
    }

    await logActivity(prisma, {
      userId: user.id,
      action: "INVENTORY_SUPPLIER_UPSERT",
      entityType: "supplier",
      entityId: id,
      metadata: { name: data.name },
    });

    const refreshed = await prisma.supplier.findUniqueOrThrow({
      where: { id },
      include: {
        purchases: {
          orderBy: { purchaseDate: "desc" },
          take: 10,
        },
        rawMaterials: { take: 20 },
        packagingMaterials: { take: 20 },
        _count: {
          select: {
            rawMaterials: true,
            packagingMaterials: true,
            purchases: true,
          },
        },
      },
    });

    return toSupplierListItemDto(refreshed);
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_SUPPLIER_GET, async (_evt, supplierId?: string) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_READ);

    const id = String(supplierId ?? "").trim();
    if (!id) throw new Error("Fournisseur introuvable.");

    const supplier = await prisma.supplier.findUniqueOrThrow({
      where: { id },
      include: {
        purchases: { orderBy: { purchaseDate: "desc" }, take: 40 },
        rawMaterials: { take: 100 },
        packagingMaterials: { take: 100 },
        _count: { select: { rawMaterials: true, packagingMaterials: true, purchases: true } },
      },
    });
    return toSupplierDetailDto(supplier);
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_PURCHASE_LIST, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_READ);

    const paging = pagingSchema.parse(payload ?? {});

    const [total, entries] = await prisma.$transaction([
      prisma.purchaseEntry.count(),
      prisma.purchaseEntry.findMany({
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
        orderBy: { purchaseDate: "desc" },
        include: {
          supplier: true,
          lines: true,
        },
      }),
    ]);

    return toIpcPayload(
      {
        total,
        page: paging.page,
        pageSize: paging.pageSize,
        items: entries.map(toPurchaseEntryListItemDto),
      },
      IPC_CHANNELS.INVENTORY_PURCHASE_LIST,
    );
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_PURCHASE_CREATE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_PURCHASE);

    const dto = purchaseCreateSchema.parse(payload);
    const linePayloads = [];

    for (const line of dto.lines) {
      const qty = parseDecimal(line.qty);
      const unitPrice = parseDecimal(line.unitPrice);

      if (line.materialKind === "RAW" && line.rawMaterialId) {
        const rm = await prisma.rawMaterial.findUniqueOrThrow({
          where: { id: line.rawMaterialId },
        });
        linePayloads.push({
          materialKind: MaterialKind.RAW,
          rawMaterialId: rm.id,
          packagingMaterialId: undefined,
          qtyIn: qty,
          unitPrice,
          expiresAt: line.expiresAt ? new Date(line.expiresAt) : null,
          labelSnapshot: rm.labelFr,
          skuSnapshot: rm.sku,
          unitSnapshot: rm.unit,
        });
      } else if (line.materialKind === "PACKAGING" && line.packagingMaterialId) {
        const pk = await prisma.packagingMaterial.findUniqueOrThrow({
          where: { id: line.packagingMaterialId },
        });
        linePayloads.push({
          materialKind: MaterialKind.PACKAGING,
          rawMaterialId: undefined,
          packagingMaterialId: pk.id,
          qtyIn: qty,
          unitPrice,
          expiresAt: line.expiresAt ? new Date(line.expiresAt) : null,
          labelSnapshot: pk.labelFr,
          skuSnapshot: pk.sku,
          unitSnapshot: pk.unit,
        });
      }
    }

    if (linePayloads.length !== dto.lines.length) {
      throw new Error("Chaque ligne d’achat doit cibler un article inventorié.");
    }

    const { purchaseId } = await createPurchaseEntryLedger({
      prisma,
      input: {
        supplierId: dto.supplierId,
        invoiceRef: dto.invoiceRef ?? null,
        notes: dto.notes ?? null,
        purchaseDate: new Date(dto.purchaseDate),
        currencyCode: dto.currencyCode,
        createdById: user.id,
        lines: linePayloads,
      },
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "INVENTORY_PURCHASE_CREATE",
      entityType: "purchase_entry",
      entityId: purchaseId,
      metadata: { invoice: dto.invoiceRef ?? "", lineCount: linePayloads.length },
    });

    const entry = await prisma.purchaseEntry.findUniqueOrThrow({
      where: { id: purchaseId },
      include: { supplier: true, lines: true },
    });

    return toIpcPayload(toPurchaseEntryListItemDto(entry), IPC_CHANNELS.INVENTORY_PURCHASE_CREATE);
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_MOVEMENT_LIST, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_READ);

    const paging = pagingSchema.parse(payload ?? {});

    const [total, rows] = await prisma.$transaction([
      prisma.stockMovement.count(),
      prisma.stockMovement.findMany({
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
        orderBy: { occurredAt: "desc" },
        include: {
          rawMaterial: true,
          packagingMaterial: true,
          createdBy: { select: { displayName: true, username: true } },
        },
      }),
    ]);

    return toIpcPayload(
      {
        total,
        page: paging.page,
        pageSize: paging.pageSize,
        items: rows.map((movement) => ({
          ...serializeMovementScalars(movement),
          materialLabel:
            movement.rawMaterial?.labelFr ??
            movement.packagingMaterial?.labelFr ??
            "—",
          materialSku: movement.rawMaterial?.sku ?? movement.packagingMaterial?.sku ?? "—",
          actor:
            movement.createdBy?.displayName ??
            movement.createdBy?.username ??
            "—",
        })),
      },
      IPC_CHANNELS.INVENTORY_MOVEMENT_LIST,
    );
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_MOVEMENT_OUTBOUND, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_ADJUST);

    const dto = outboundMovementSchema.parse(payload);
    await prisma.$transaction(async (tx) => {
      const kind = dto.materialKind as MaterialKind;
      const materialId = kind === "RAW" ? dto.rawMaterialId! : dto.packagingMaterialId!;
      await postSignedMovement({
        prisma: tx,
        materialKind: kind,
        materialId,
        qtySigned: parseDecimal(dto.qtyOut).mul(-1),
        inventoryKind: dto.inventoryKind as InventoryMovementKind,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        note: dto.note ?? null,
        userId: user.id,
      });
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "INVENTORY_MOVEMENT_OUTBOUND",
      entityType: "stock_movement",
      metadata: { kind: dto.inventoryKind },
    });

    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_MOVEMENT_INBOUND, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_ADJUST);

    const dto = inboundMovementSchema.parse(payload);
    await prisma.$transaction(async (tx) => {
      const kind = dto.materialKind as MaterialKind;
      const materialId = kind === "RAW" ? dto.rawMaterialId! : dto.packagingMaterialId!;

      await postSignedMovement({
        prisma: tx,
        materialKind: kind,
        materialId,
        qtySigned: parseDecimal(dto.qtyIn),
        inventoryKind: dto.inventoryKind as InventoryMovementKind,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        note: dto.note ?? null,
        userId: user.id,
      });
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "INVENTORY_MOVEMENT_INBOUND",
      entityType: "stock_movement",
      metadata: { kind: dto.inventoryKind },
    });

    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_MOVEMENT_MANUAL_ADJUSTMENT, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_ADJUST);

    const dto = manualAdjustmentSchema.parse(payload);
    await prisma.$transaction(async (tx) => {
      const kind = dto.materialKind as MaterialKind;
      const materialId = kind === "RAW" ? dto.rawMaterialId! : dto.packagingMaterialId!;

      const current = await getCurrentQty(tx, kind, materialId);
      const target = parseDecimal(dto.targetQty);
      await postSignedMovement({
        prisma: tx,
        materialKind: kind,
        materialId,
        qtySigned: target.sub(current),
        inventoryKind: InventoryMovementKind.MANUAL_ADJUSTMENT,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        note: dto.note ?? null,
        userId: user.id,
      });
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "INVENTORY_MOVEMENT_MANUAL",
      entityType: "stock_movement",
      metadata: {},
    });

    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_DASHBOARD_SUMMARY, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_READ);

    const [rawItems, pkItems] = await Promise.all([
      prisma.rawMaterial.findMany({
        where: { isActive: true },
      }),
      prisma.packagingMaterial.findMany({
        where: { isActive: true },
      }),
    ]);

    const hydratedRaw = await hydrateRawBalances(rawItems);
    const hydratedPk = await hydratePackBalances(pkItems);

    let totalValueSerialized = decimalToString(parseDecimal("0"));
    hydratedRaw.forEach((row) => {
      const qty = parseDecimal(row.currentQtySerialized);
      const unitCost = parseDecimal(row.costPriceUnit);
      totalValueSerialized = decimalToString(parseDecimal(totalValueSerialized).add(qty.mul(unitCost)));
    });
    hydratedPk.forEach((row) => {
      const qty = parseDecimal(row.currentQtySerialized);
      const unitCost = parseDecimal(row.costPriceUnit);
      totalValueSerialized = decimalToString(parseDecimal(totalValueSerialized).add(qty.mul(unitCost)));
    });

    const lowCandidates = [...hydratedRaw, ...hydratedPk].filter((row) => row.isLowStock).slice(0, 25);

    const soonBoundary = Date.now() + 1000 * 60 * 60 * 24 * 45;
    const expiring = await prisma.stockMovement.findMany({
      where: {
        expiresAt: { not: null, lte: new Date(soonBoundary), gte: new Date(Date.now()) },
        inventoryKind: InventoryMovementKind.PURCHASE_IN,
      },
      orderBy: { expiresAt: "asc" },
      take: 40,
      include: { rawMaterial: true, packagingMaterial: true },
    });

    const latestPurchases = await prisma.purchaseEntry.findMany({
      orderBy: { purchaseDate: "desc" },
      take: 10,
      include: { supplier: true },
    });

    const latestMovements = await prisma.stockMovement.findMany({
      orderBy: { occurredAt: "desc" },
      take: 35,
      include: { rawMaterial: true, packagingMaterial: true, createdBy: true },
    });

    const suppliers = await prisma.supplier.findMany({
      include: { _count: { select: { purchases: true } } },
      orderBy: { name: "asc" },
    });

    const purchaseTotals = await prisma.purchaseEntry.aggregate({
      _sum: { totalAmount: true },
    });

    const payload = {
      totals: {
        inventoryValueSerialized: totalValueSerialized,
        recordedPurchasesSerialized: decimalToString(purchaseTotals._sum.totalAmount ?? 0),
      },
      lowStock: lowCandidates.map((candidate) => ({
        sku: candidate.sku,
        label: candidate.labelFr,
        currentQtySerialized: candidate.currentQtySerialized,
        thresholdSerialized: candidate.minimumStockQty,
      })),
      expiringSoon: expiring.map((movement) => ({
        ...serializeMovementScalars(movement),
        materialLabel:
          movement.rawMaterial?.labelFr ?? movement.packagingMaterial?.labelFr ?? "—",
      })),
      latestPurchases: latestPurchases.map((purchase) => ({
        id: purchase.id,
        purchaseDate: purchase.purchaseDate.toISOString(),
        supplierName: purchase.supplier.name,
        invoiceRef: purchase.invoiceRef ?? "",
        totalSerialized: decimalToString(purchase.totalAmount),
      })),
      latestMovements: latestMovements.map((movement) => ({
        ...serializeMovementScalars(movement),
        materialLabel:
          movement.rawMaterial?.labelFr ?? movement.packagingMaterial?.labelFr ?? "—",
        actor:
          movement.createdBy?.displayName ?? movement.createdBy?.username ?? "—",
      })),
      suppliers: suppliers.map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        purchases: supplier._count.purchases,
      })),
    };
    return toIpcPayload(payload, IPC_CHANNELS.INVENTORY_DASHBOARD_SUMMARY);
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_REPORT_VALUATION, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_REPORT);

    const [rawItems, pkgItems] = await Promise.all([
      prisma.rawMaterial.findMany({
        where: { isActive: true },
      }),
      prisma.packagingMaterial.findMany({
        where: { isActive: true },
      }),
    ]);

    const hydratedRaw = await hydrateRawBalances(rawItems);
    const hydratedPk = await hydratePackBalances(pkgItems);

    const headers = ["Type", "SKU", "Désignation", "Unité", "Qté physique", "Coût unitaire", "Valeur"];
    const rows: Array<Array<string>> = [];

    for (const item of hydratedRaw) {
      const qty = parseDecimal(item.currentQtySerialized);
      const cost = parseDecimal(item.costPriceUnit);
      rows.push([
        "Matière",
        item.sku,
        item.labelFr,
        item.unit,
        qty.toFixed(4),
        cost.toFixed(4),
        qty.mul(cost).toFixed(2),
      ]);
    }

    for (const item of hydratedPk) {
      const qty = parseDecimal(item.currentQtySerialized);
      const cost = parseDecimal(item.costPriceUnit);
      rows.push([
        "Emballage",
        item.sku,
        item.labelFr,
        item.unit,
        qty.toFixed(4),
        cost.toFixed(4),
        qty.mul(cost).toFixed(2),
      ]);
    }

    const csv = csvFromRows(headers, rows);
    return { csv };
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_REPORT_MOVEMENTS_EXPORT, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_REPORT);

    const rows = await prisma.stockMovement.findMany({
      include: {
        rawMaterial: true,
        packagingMaterial: true,
        createdBy: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 5000,
    });

    const headers = ["Date", "Type", "Article", "Avant", "Après", "Delta", "Référence", "Utilisateur"];

    const data = rows.map((row) => [
      row.occurredAt.toISOString(),
      row.inventoryKind,
      row.rawMaterial?.labelFr ?? row.packagingMaterial?.labelFr ?? "—",
      decimalToString(row.qtyBefore),
      decimalToString(row.qtyAfter),
      decimalToString(row.qtySigned),
      `${row.referenceType ?? ""}:${row.referenceId ?? ""}`,
      row.createdBy?.displayName ?? row.createdBy?.username ?? "—",
    ]);

    return { csv: csvFromRows(headers, data) };
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_REPORT_PURCHASE_EXPORT, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_REPORT);

    const purchases = await prisma.purchaseEntry.findMany({
      orderBy: { purchaseDate: "desc" },
      take: 2500,
      include: {
        supplier: true,
        lines: true,
      },
    });

    const headers = [
      "Bon",
      "Date",
      "Fournisseur",
      "Facture",
      "SKU",
      "Libellé",
      "Quantité",
      "PU",
      "Total ligne",
      "Expire",
      "Bon total",
    ];

    const aggregated: Array<Array<string>> = [];
    purchases.forEach((purchase) => {
      purchase.lines.forEach((line) => {
        aggregated.push([
          purchase.id.slice(0, 8),
          purchase.purchaseDate.toISOString(),
          purchase.supplier.name,
          purchase.invoiceRef ?? "",
          line.skuSnapshot ?? "",
          line.labelSnapshot ?? "",
          decimalToString(line.qty),
          decimalToString(line.unitPrice),
          decimalToString(line.lineTotal),
          line.expiresAt ? line.expiresAt.toISOString() : "",
          decimalToString(purchase.totalAmount),
        ]);
      });
    });

    return { csv: csvFromRows(headers, aggregated) };
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_REPORT_LOW_STOCK_EXPORT, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_REPORT);

    const [rawList, pkList] = await Promise.all([
      prisma.rawMaterial.findMany({ where: { isActive: true } }),
      prisma.packagingMaterial.findMany({ where: { isActive: true } }),
    ]);

    const rawHydrated = await hydrateRawBalances(rawList);
    const pkHydrated = await hydratePackBalances(pkList);

    const headers = ["Type", "SKU", "Libellé", "Minimum", "Réel"];

    const data: Array<Array<string>> = [];
    rawHydrated
      .filter((entry) => entry.isLowStock)
      .forEach((entry) =>
        data.push([
          "Matière primaire",
          entry.sku,
          entry.labelFr,
          entry.minimumStockQty,
          entry.currentQtySerialized,
        ]),
      );

    pkHydrated
      .filter((entry) => entry.isLowStock)
      .forEach((entry) =>
        data.push([
          "Emballage",
          entry.sku,
          entry.labelFr,
          entry.minimumStockQty,
          entry.currentQtySerialized,
        ]),
      );

    return { csv: csvFromRows(headers, data) };
  });

  ipcMain.handle(IPC_CHANNELS.INVENTORY_REPORT_EXPIRATION_EXPORT, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.INVENTORY_REPORT);

    const rows = await prisma.stockMovement.findMany({
      where: {
        expiresAt: { not: null },
      },
      orderBy: { expiresAt: "asc" },
      take: 2500,
      include: {
        rawMaterial: true,
        packagingMaterial: true,
      },
    });

    const headers = ["Expire", "Type mouvement", "Article", "Quantité Δ", "Note"];

    const data = rows.map((row) => [
      row.expiresAt!.toISOString(),
      row.inventoryKind,
      row.rawMaterial?.labelFr ?? row.packagingMaterial?.labelFr ?? "—",
      decimalToString(row.qtySigned),
      row.note ?? "",
    ]);

    return { csv: csvFromRows(headers, data) };
  });
}
