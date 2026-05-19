import { ipcMain } from "electron";
import { Decimal, InvoiceStatus, MaterialKind } from "../prisma-client.js";

import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import {
  customerListFiltersSchema,
  customerUpsertSchema,
  invoiceCancelSchema,
  invoiceCreateDraftSchema,
  invoiceListFiltersSchema,
  invoiceLinesReplaceSchema,
  invoiceUpdateDraftSchema,
  invoiceValidateSchema,
  paymentRegisterSchema,
  productListFiltersSchema,
  productUpsertSchema,
} from "../../shared/schemas/sales.js";
import { getPrisma } from "../database.js";
import { logActivity } from "../services/activity-service.js";
import { resolveSessionUser, sessionHasPermission } from "../services/auth-service.js";
import { decimalToString, getCurrentQty, parseDecimal } from "../services/inventory-service.js";
import {
  cancelInvoice,
  createInvoiceDraft,
  registerPayment,
  replaceDraftInvoiceLines,
  updateInvoiceDraftMeta,
  validateInvoice,
} from "../services/sales-service.js";

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
  const needsQuotes = /[";\r\n]/.test(value);
  const escaped = value.replaceAll('"', '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function csvFromRows(headers: string[], rows: Array<Array<string>>): string {
  const head = headers.map(csvEscape).join(";");
  const body = rows.map((row) => row.map(csvEscape).join(";")).join("\r\n");
  return `${head}\r\n${body}`;
}

function serializeCustomer(row: {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  taxIdentifier: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeProduct(row: {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  sellingPrice: unknown;
  unit: string;
  recipeId: string | null;
  packagingMaterialId: string | null;
  barcode: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    sellingPriceSerialized: decimalToString(row.sellingPrice),
    unit: row.unit,
    recipeId: row.recipeId,
    packagingMaterialId: row.packagingMaterialId,
    barcode: row.barcode,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializePackagingBrief(row: {
  id: string;
  sku: string;
  labelFr: string;
  currentQty?: unknown;
  unit?: string;
} | null) {
  if (!row) return null;
  return {
    id: row.id,
    sku: row.sku,
    labelFr: row.labelFr,
    ...(row.currentQty !== undefined
      ? { currentQtySerialized: decimalToString(row.currentQty) }
      : {}),
    ...(row.unit !== undefined ? { unit: row.unit } : {}),
  };
}

function serializeRecipeBrief(row: { id: string; code: string; labelFr: string } | null) {
  if (!row) return null;
  return { id: row.id, code: row.code, labelFr: row.labelFr };
}

function serializeInvoiceHeader(row: {
  id: string;
  number: string;
  customerId: string;
  issuedAt: Date;
  dueAt: Date | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  currencyCode: string;
  subtotalAmount: unknown;
  taxAmount: unknown;
  discountAmount: unknown;
  totalAmount: unknown;
  notes: string | null;
  metadata: string;
  createdById: string | null;
  validatedAt: Date | null;
  validatedById: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    number: row.number,
    customerId: row.customerId,
    status: row.status,
    paymentStatus: row.paymentStatus,
    paymentMethod: row.paymentMethod,
    currencyCode: row.currencyCode,
    notes: row.notes,
    metadata: row.metadata,
    createdById: row.createdById,
    validatedById: row.validatedById,
    issuedAt: row.issuedAt.toISOString(),
    dueAt: row.dueAt?.toISOString() ?? null,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    subtotalAmountSerialized: decimalToString(row.subtotalAmount),
    taxAmountSerialized: decimalToString(row.taxAmount),
    discountAmountSerialized: decimalToString(row.discountAmount),
    totalAmountSerialized: decimalToString(row.totalAmount),
  };
}

function serializeInvoiceItem(row: {
  id: string;
  invoiceId: string;
  productId: string | null;
  labelFr: string;
  skuSnapshot: string | null;
  sortOrder: number;
  quantity: unknown;
  unitPrice: unknown;
  lineDiscount: unknown;
  taxRate: unknown;
  lineSubtotal: unknown;
  lineTax: unknown;
  lineTotal: unknown;
}) {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    productId: row.productId,
    labelFr: row.labelFr,
    skuSnapshot: row.skuSnapshot,
    sortOrder: row.sortOrder,
    quantitySerialized: decimalToString(row.quantity),
    unitPriceSerialized: decimalToString(row.unitPrice),
    lineDiscountSerialized: decimalToString(row.lineDiscount),
    taxRateSerialized: decimalToString(row.taxRate),
    lineSubtotalSerialized: decimalToString(row.lineSubtotal),
    lineTaxSerialized: decimalToString(row.lineTax),
    lineTotalSerialized: decimalToString(row.lineTotal),
  };
}

function serializePayment(row: {
  id: string;
  invoiceId: string;
  amount: unknown;
  method: string;
  reference: string | null;
  paidAt: Date;
  createdAt: Date;
}) {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    method: row.method,
    reference: row.reference,
    amountSerialized: decimalToString(row.amount),
    paidAt: row.paidAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function registerSalesHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SALES_CUSTOMER_LIST, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_READ);
    const filters = customerListFiltersSchema.parse(payload ?? {});
    const prisma = getPrisma();

    const whereParts: object[] = [];
    if (!filters.includeInactive) whereParts.push({ isActive: true });
    const term = filters.q.trim();
    if (term.length > 0) {
      whereParts.push({
        OR: [
          { code: { contains: term } },
          { name: { contains: term } },
          { phone: { contains: term } },
          { city: { contains: term } },
        ],
      });
    }
    if (filters.city.trim()) whereParts.push({ city: { contains: filters.city.trim() } });

    const where = whereParts.length ? { AND: whereParts } : {};

    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: [{ name: "asc" }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
    ]);

    return { items: rows.map(serializeCustomer), total };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_CUSTOMER_GET, async (_evt, customerId: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_READ);
    const id = zStringUuid(customerId);
    const prisma = getPrisma();
    const row = await prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: { issuedAt: "desc" },
          take: 80,
          select: {
            id: true,
            number: true,
            issuedAt: true,
            status: true,
            paymentStatus: true,
            totalAmount: true,
          },
        },
      },
    });
    if (!row) throw new Error("Client introuvable.");
    const inv = row.invoices.map((i) => ({
      ...i,
      issuedAt: i.issuedAt.toISOString(),
      totalAmountSerialized: decimalToString(i.totalAmount),
    }));
    return { customer: serializeCustomer(row), invoices: inv };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_CUSTOMER_UPSERT, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_WRITE);
    const dto = customerUpsertSchema.parse(payload);
    const prisma = getPrisma();

    if (!dto.id) {
      const created = await prisma.customer.create({
        data: {
          code: dto.code.trim(),
          name: dto.name.trim(),
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          city: dto.city ?? null,
          taxIdentifier: dto.taxIdentifier ?? null,
          notes: dto.notes ?? null,
          isActive: dto.isActive,
        },
      });
      await logActivity(prisma, {
        userId: user.id,
        action: "SALES_CUSTOMER_CREATE",
        entityType: "customer",
        entityId: created.id,
        metadata: { code: created.code },
      });
      return serializeCustomer(created);
    }

    try {
      const updated = await prisma.customer.update({
        where: { id: dto.id },
        data: {
          code: dto.code.trim(),
          name: dto.name.trim(),
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          city: dto.city ?? null,
          taxIdentifier: dto.taxIdentifier ?? null,
          notes: dto.notes ?? null,
          isActive: dto.isActive,
        },
      });
      await logActivity(prisma, {
        userId: user.id,
        action: "SALES_CUSTOMER_UPDATE",
        entityType: "customer",
        entityId: updated.id,
        metadata: { code: updated.code },
      });
      return serializeCustomer(updated);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unique constraint")) throw new Error("Code client déjà utilisé.");
      throw e;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SALES_PRODUCT_LIST, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_READ);
    const filters = productListFiltersSchema.parse(payload ?? {});
    const prisma = getPrisma();

    const whereParts: object[] = [];
    if (!filters.includeInactive) whereParts.push({ isActive: true });
    const term = filters.q.trim();
    if (term.length > 0) {
      whereParts.push({
        OR: [{ sku: { contains: term } }, { name: { contains: term } }, { barcode: { contains: term } }],
      });
    }
    if (filters.category.trim()) whereParts.push({ category: { contains: filters.category.trim() } });
    const where = whereParts.length ? { AND: whereParts } : {};

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: [{ name: "asc" }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: {
          packagingMaterial: { select: { id: true, sku: true, labelFr: true, unit: true } },
          recipe: { select: { id: true, code: true, labelFr: true } },
        },
      }),
    ]);

    const hydrated = await Promise.all(
      rows.map(async (r) => {
        let stockQtySerialized: string | null = null;
        if (r.packagingMaterialId) {
          const q = await getCurrentQty(prisma, MaterialKind.PACKAGING, r.packagingMaterialId);
          stockQtySerialized = decimalToString(q);
        }
        return {
          ...serializeProduct(r),
          packagingMaterial: serializePackagingBrief(r.packagingMaterial),
          recipe: serializeRecipeBrief(r.recipe),
          stockQtySerialized,
        };
      }),
    );

    return { items: hydrated, total };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_PRODUCT_GET, async (_evt, productId: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_READ);
    const id = zStringUuid(productId);
    const prisma = getPrisma();
    const row = await prisma.product.findUnique({
      where: { id },
      include: {
        packagingMaterial: true,
        recipe: true,
      },
    });
    if (!row) throw new Error("Produit introuvable.");
    let stockQtySerialized: string | null = null;
    if (row.packagingMaterialId) {
      const q = await getCurrentQty(prisma, MaterialKind.PACKAGING, row.packagingMaterialId);
      stockQtySerialized = decimalToString(q);
    }
    return {
      ...serializeProduct(row),
      packagingMaterial: serializePackagingBrief(row.packagingMaterial),
      recipe: serializeRecipeBrief(row.recipe),
      stockQtySerialized,
    };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_PRODUCT_UPSERT, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_WRITE);
    const dto = productUpsertSchema.parse(payload);
    const prisma = getPrisma();

    if (dto.packagingMaterialId && dto.recipeId) {
      const recipe = await prisma.recipe.findUnique({ where: { id: dto.recipeId } });
      if (recipe?.outputPackagingMaterialId && recipe.outputPackagingMaterialId !== dto.packagingMaterialId) {
        throw new Error("L’emballage lié ne correspond pas à la sortie de la recette sélectionnée.");
      }
    }

    const data = {
      sku: dto.sku.trim(),
      name: dto.name.trim(),
      category: dto.category?.trim() ? dto.category.trim() : null,
      sellingPrice: parseDecimal(dto.sellingPrice),
      unit: dto.unit,
      recipeId: dto.recipeId ?? null,
      packagingMaterialId: dto.packagingMaterialId ?? null,
      barcode: dto.barcode?.trim() ? dto.barcode.trim() : null,
      notes: dto.notes ?? null,
      isActive: dto.isActive,
    };

    if (!dto.id) {
      const created = await prisma.product.create({ data });
      await logActivity(prisma, {
        userId: user.id,
        action: "SALES_PRODUCT_CREATE",
        entityType: "product",
        entityId: created.id,
        metadata: { sku: created.sku },
      });
      return serializeProduct(created);
    }

    try {
      const updated = await prisma.product.update({ where: { id: dto.id }, data });
      await logActivity(prisma, {
        userId: user.id,
        action: "SALES_PRODUCT_UPDATE",
        entityType: "product",
        entityId: updated.id,
        metadata: { sku: updated.sku },
      });
      return serializeProduct(updated);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unique constraint")) throw new Error("SKU déjà utilisé.");
      throw e;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SALES_INVOICE_LIST, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_READ);
    const filters = invoiceListFiltersSchema.parse(payload ?? {});
    const prisma = getPrisma();

    const whereParts: object[] = [];
    const term = filters.q.trim();
    if (term.length > 0) {
      whereParts.push({
        OR: [{ number: { contains: term } }, { customer: { name: { contains: term } } }],
      });
    }
    if (filters.status) whereParts.push({ status: filters.status });
    if (filters.paymentStatus) whereParts.push({ paymentStatus: filters.paymentStatus });
    if (filters.customerId) whereParts.push({ customerId: filters.customerId });
    if (filters.from) whereParts.push({ issuedAt: { gte: new Date(filters.from) } });
    if (filters.to) whereParts.push({ issuedAt: { lte: new Date(filters.to) } });
    const where = whereParts.length ? { AND: whereParts } : {};

    const [total, rows] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: [{ issuedAt: "desc" }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: {
          customer: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);

    return {
      items: rows.map((r) => ({
        ...serializeInvoiceHeader(r),
        customer: r.customer,
      })),
      total,
    };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_INVOICE_GET, async (_evt, invoiceId: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_READ);
    const id = zStringUuid(invoiceId);
    const prisma = getPrisma();
    const row = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { product: true } },
        payments: { orderBy: { paidAt: "desc" } },
        createdBy: { select: { id: true, displayName: true, username: true } },
        validatedBy: { select: { id: true, displayName: true, username: true } },
      },
    });
    if (!row) throw new Error("Facture introuvable.");

    const payments = row.payments.map(serializePayment);
    const items = row.items.map(serializeInvoiceItem);

    const paidSum = payments.reduce((acc, p) => acc.add(parseDecimal(p.amountSerialized)), parseDecimal("0"));
    const total = parseDecimal(decimalToString(row.totalAmount));
    const balanceSerialized = decimalToString(total.minus(paidSum));

    return {
      invoice: {
        ...serializeInvoiceHeader(row),
        customer: serializeCustomer(row.customer),
        items,
        payments,
        balanceSerialized,
      },
    };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_INVOICE_CREATE_DRAFT, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_WRITE);
    const dto = invoiceCreateDraftSchema.parse(payload);
    const prisma = getPrisma();

    const lines = dto.lines.map((ln) => ({
      productId: ln.productId ?? null,
      labelFr: ln.labelFr,
      quantity: parseDecimal(ln.quantity),
      unitPrice: parseDecimal(ln.unitPrice),
      lineDiscount: parseDecimal(ln.lineDiscount ?? "0"),
      taxRate: parseDecimal(ln.taxRate ?? "0"),
      notes: ln.notes ?? null,
    }));

    const { id, number } = await createInvoiceDraft(prisma, {
      userId: user.id,
      customerId: dto.customerId,
      issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
      dueAt: dto.dueAt != null ? new Date(dto.dueAt) : null,
      paymentMethod: dto.paymentMethod ?? null,
      currencyCode: dto.currencyCode,
      discountAmount: parseDecimal(dto.discountAmount ?? "0"),
      notes: dto.notes ?? null,
      lines,
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "SALES_INVOICE_DRAFT_CREATE",
      entityType: "invoice",
      entityId: id,
      metadata: { number },
    });

    return { id, number };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_INVOICE_UPDATE_DRAFT, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_WRITE);
    const dto = invoiceUpdateDraftSchema.parse(payload);
    const prisma = getPrisma();

    await updateInvoiceDraftMeta(prisma, {
      invoiceId: dto.invoiceId,
      patch: {
        ...(dto.patch.customerId ? { customerId: dto.patch.customerId } : {}),
        ...(dto.patch.issuedAt ? { issuedAt: new Date(dto.patch.issuedAt) } : {}),
        ...(dto.patch.dueAt !== undefined
          ? { dueAt: dto.patch.dueAt == null ? null : new Date(dto.patch.dueAt) }
          : {}),
        ...(dto.patch.paymentMethod !== undefined ? { paymentMethod: dto.patch.paymentMethod ?? null } : {}),
        ...(dto.patch.currencyCode ? { currencyCode: dto.patch.currencyCode } : {}),
        ...(dto.patch.discountAmount ? { discountAmount: parseDecimal(dto.patch.discountAmount) } : {}),
        ...(dto.patch.notes !== undefined ? { notes: dto.patch.notes ?? null } : {}),
      },
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "SALES_INVOICE_DRAFT_UPDATE",
      entityType: "invoice",
      entityId: dto.invoiceId,
      metadata: {},
    });

    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_INVOICE_LINES_REPLACE, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_WRITE);
    const dto = invoiceLinesReplaceSchema.parse(payload);
    const prisma = getPrisma();

    const lines = dto.lines.map((ln) => ({
      productId: ln.productId ?? null,
      labelFr: ln.labelFr,
      quantity: parseDecimal(ln.quantity),
      unitPrice: parseDecimal(ln.unitPrice),
      lineDiscount: parseDecimal(ln.lineDiscount ?? "0"),
      taxRate: parseDecimal(ln.taxRate ?? "0"),
      notes: ln.notes ?? null,
    }));

    await replaceDraftInvoiceLines(prisma, { invoiceId: dto.invoiceId, lines });

    await logActivity(prisma, {
      userId: user.id,
      action: "SALES_INVOICE_LINES_REPLACE",
      entityType: "invoice",
      entityId: dto.invoiceId,
      metadata: { lineCount: lines.length },
    });

    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_INVOICE_VALIDATE, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_VALIDATE);
    const dto = invoiceValidateSchema.parse(payload);
    const prisma = getPrisma();
    await validateInvoice(prisma, { invoiceId: dto.invoiceId, userId: user.id });
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: dto.invoiceId }, select: { number: true } });
    await logActivity(prisma, {
      userId: user.id,
      action: "SALES_INVOICE_VALIDATE",
      entityType: "invoice",
      entityId: dto.invoiceId,
      metadata: { number: row.number },
    });
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_INVOICE_CANCEL, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_CANCEL);
    const dto = invoiceCancelSchema.parse(payload);
    const prisma = getPrisma();
    await cancelInvoice(prisma, { invoiceId: dto.invoiceId, userId: user.id });
    await logActivity(prisma, {
      userId: user.id,
      action: "SALES_INVOICE_CANCEL",
      entityType: "invoice",
      entityId: dto.invoiceId,
      metadata: {},
    });
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_PAYMENT_REGISTER, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_PAYMENT);
    const dto = paymentRegisterSchema.parse(payload);
    const prisma = getPrisma();
    await registerPayment(prisma, {
      invoiceId: dto.invoiceId,
      userId: user.id,
      amount: parseDecimal(dto.amount),
      method: dto.method,
      paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
      reference: dto.reference ?? null,
      notes: dto.notes ?? null,
    });
    await logActivity(prisma, {
      userId: user.id,
      action: "SALES_PAYMENT_REGISTER",
      entityType: "invoice",
      entityId: dto.invoiceId,
      metadata: { amount: dto.amount },
    });
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_DASHBOARD_SUMMARY, async () => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_READ);
    const prisma = getPrisma();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const todayAgg = await prisma.invoice.aggregate({
      _sum: { totalAmount: true },
      where: {
        issuedAt: { gte: startOfToday, lte: endOfToday },
        status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
      },
    });

    const unpaidCount = await prisma.invoice.count({
      where: {
        status: { in: [InvoiceStatus.VALIDATED] },
        paymentStatus: { in: ["UNPAID", "PARTIAL"] },
      },
    });

    const recent = await prisma.invoice.findMany({
      where: { status: { not: InvoiceStatus.CANCELLED } },
      orderBy: { issuedAt: "desc" },
      take: 12,
      include: { customer: { select: { name: true, code: true } } },
    });

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    const trendInvoices = await prisma.invoice.findMany({
      where: {
        issuedAt: { gte: fourteenDaysAgo },
        status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
      },
      select: { issuedAt: true, totalAmount: true },
    });

    const trendMap = new Map<string, Decimal>();
    for (const inv of trendInvoices) {
      const key = inv.issuedAt.toISOString().slice(0, 10);
      const amt = inv.totalAmount instanceof Decimal ? inv.totalAmount : new Decimal(String(inv.totalAmount));
      const prev = trendMap.get(key) ?? new Decimal(0);
      trendMap.set(key, prev.add(amt));
    }

    const trend14d: Array<{ date: string; revenueSerialized: string }> = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      trend14d.push({
        date: key,
        revenueSerialized: decimalToString(trendMap.get(key) ?? new Decimal(0)),
      });
    }

    const topCustomersRaw = await prisma.invoice.groupBy({
      by: ["customerId"],
      _sum: { totalAmount: true },
      where: {
        status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
        issuedAt: { gte: fourteenDaysAgo },
      },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 8,
    });

    const customerIds = topCustomersRaw.map((t) => t.customerId);
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, code: true, name: true },
    });
    const custMap = new Map(customers.map((c) => [c.id, c]));

    const topCustomers = topCustomersRaw.map((t) => ({
      customerId: t.customerId,
      customer: custMap.get(t.customerId) ?? { id: t.customerId, code: "?", name: "?" },
      revenueSerialized: decimalToString(t._sum.totalAmount ?? new Decimal(0)),
    }));

    const paymentsWindow = await prisma.paymentRecord.findMany({
      where: { paidAt: { gte: fourteenDaysAgo } },
      select: { method: true, amount: true },
    });

    const payAccum = new Map<string, Decimal>();
    for (const p of paymentsWindow) {
      const amt = p.amount instanceof Decimal ? p.amount : new Decimal(String(p.amount));
      const prev = payAccum.get(p.method) ?? new Decimal(0);
      payAccum.set(p.method, prev.add(amt));
    }

    const paymentSummary = [...payAccum.entries()].map(([method, sum]) => ({
      method,
      sumSerialized: decimalToString(sum),
    }));

    const sellableProducts = await prisma.product.findMany({
      where: { isActive: true, packagingMaterialId: { not: null } },
      select: { id: true, sku: true, name: true, packagingMaterialId: true },
      take: 120,
    });

    const lowStockAlerts: Array<{ sku: string; name: string; qtySerialized: string }> = [];
    for (const sp of sellableProducts) {
      if (!sp.packagingMaterialId) continue;
      const pk = await prisma.packagingMaterial.findUnique({
        where: { id: sp.packagingMaterialId },
        select: { minimumStockQty: true },
      });
      const qty = await getCurrentQty(prisma, MaterialKind.PACKAGING, sp.packagingMaterialId);
      const min = pk ? parseDecimal(decimalToString(pk.minimumStockQty)) : new Decimal(0);
      if (qty.lessThan(min)) {
        lowStockAlerts.push({ sku: sp.sku, name: sp.name, qtySerialized: decimalToString(qty) });
      }
    }

    return {
      todayRevenueSerialized: decimalToString(todayAgg._sum.totalAmount ?? new Decimal(0)),
      unpaidInvoiceCount: unpaidCount,
      recentInvoices: recent.map((r) => ({
        ...serializeInvoiceHeader(r),
        customer: r.customer,
      })),
      trend14d,
      topCustomers,
      paymentSummary,
      lowStockAlerts: lowStockAlerts.slice(0, 24),
    };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_NAV_COUNTS, async () => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_READ);
    const prisma = getPrisma();
    const unpaid = await prisma.invoice.count({
      where: {
        status: InvoiceStatus.VALIDATED,
        paymentStatus: { in: ["UNPAID", "PARTIAL"] },
      },
    });
    const drafts = await prisma.invoice.count({ where: { status: InvoiceStatus.DRAFT } });
    return { unpaid, drafts };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_REPORT_REVENUE_CSV, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_REPORT);
    const { from, to } = requireRange(payload);
    const prisma = getPrisma();
    const rows = await prisma.invoice.findMany({
      where: {
        issuedAt: { gte: new Date(from), lte: new Date(to) },
        status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
      },
      orderBy: { issuedAt: "asc" },
      include: { customer: true },
    });
    const csv = csvFromRows(
      ["date", "facture", "client_code", "client", "ht", "tva", "ttc", "paiement", "statut"],
      rows.map((r) => [
        r.issuedAt.toISOString().slice(0, 10),
        r.number,
        r.customer.code,
        r.customer.name,
        decimalToString(r.subtotalAmount),
        decimalToString(r.taxAmount),
        decimalToString(r.totalAmount),
        r.paymentStatus,
        r.status,
      ]),
    );
    return { csv };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_REPORT_INVOICES_CSV, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_REPORT);
    const { from, to } = requireRange(payload);
    const prisma = getPrisma();
    const rows = await prisma.invoice.findMany({
      where: { issuedAt: { gte: new Date(from), lte: new Date(to) } },
      orderBy: { issuedAt: "desc" },
      include: { customer: true },
    });
    const csv = csvFromRows(
      ["date", "facture", "client", "statut", "paiement", "ttc"],
      rows.map((r) => [
        r.issuedAt.toISOString(),
        r.number,
        r.customer.name,
        r.status,
        r.paymentStatus,
        decimalToString(r.totalAmount),
      ]),
    );
    return { csv };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_REPORT_BALANCES_CSV, async () => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_REPORT);
    const prisma = getPrisma();
    const invoices = await prisma.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
        paymentStatus: { in: ["UNPAID", "PARTIAL"] },
      },
      include: { customer: true, payments: true },
    });

    const body = invoices.map((inv) => {
      const paid = inv.payments.reduce((s, p) => s.add(parseDecimal(decimalToString(p.amount))), parseDecimal("0"));
      const total = parseDecimal(decimalToString(inv.totalAmount));
      const balance = total.minus(paid);
      return [
        inv.customer.code,
        inv.customer.name,
        inv.number,
        decimalToString(total),
        decimalToString(paid),
        decimalToString(balance),
        inv.paymentStatus,
      ];
    });

    return { csv: csvFromRows(["client_code", "client", "facture", "ttc", "paye", "solde", "paiement_statut"], body) };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_REPORT_TOP_PRODUCTS_CSV, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_REPORT);
    const { from, to } = requireRange(payload);
    const prisma = getPrisma();

    const items = await prisma.invoiceItem.findMany({
      where: {
        invoice: {
          issuedAt: { gte: new Date(from), lte: new Date(to) },
          status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
        },
        productId: { not: null },
      },
      select: {
        productId: true,
        quantity: true,
        lineTotal: true,
        skuSnapshot: true,
        labelFr: true,
      },
    });

    const map = new Map<
      string,
      { sku: string; label: string; qty: Decimal; revenue: Decimal }
    >();

    for (const it of items) {
      const pid = it.productId!;
      const qty = parseDecimal(decimalToString(it.quantity));
      const rev = parseDecimal(decimalToString(it.lineTotal));
      const cur = map.get(pid) ?? {
        sku: it.skuSnapshot ?? "?",
        label: it.labelFr,
        qty: new Decimal(0),
        revenue: new Decimal(0),
      };
      cur.qty = cur.qty.add(qty);
      cur.revenue = cur.revenue.add(rev);
      map.set(pid, cur);
    }

    const sorted = [...map.entries()].sort((a, b) => b[1].revenue.cmp(a[1].revenue));

    const csv = csvFromRows(
      ["sku", "produit", "qty_vendue", "ca_ligne"],
      sorted.map(([, v]) => [v.sku, v.label, decimalToString(v.qty), decimalToString(v.revenue)]),
    );
    return { csv };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_REPORT_PAYMENTS_CSV, async (_evt, payload: unknown) => {
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.SALES_REPORT);
    const { from, to } = requireRange(payload);
    const prisma = getPrisma();
    const rows = await prisma.paymentRecord.findMany({
      where: { paidAt: { gte: new Date(from), lte: new Date(to) } },
      orderBy: { paidAt: "desc" },
      include: { invoice: { select: { number: true } } },
    });

    const csv = csvFromRows(
      ["date", "facture", "montant", "methode", "reference"],
      rows.map((r) => [
        r.paidAt.toISOString(),
        r.invoice.number,
        decimalToString(r.amount),
        r.method,
        r.reference ?? "",
      ]),
    );
    return { csv };
  });

}

function zStringUuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error("Identifiant invalide.");
  }
  return value;
}

function requireRange(payload: unknown): { from: string; to: string } {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const from = typeof raw.from === "string" ? raw.from : "";
  const to = typeof raw.to === "string" ? raw.to : "";
  if (!from || !to) throw new Error("Plage from/to requise.");
  return { from, to };
}
