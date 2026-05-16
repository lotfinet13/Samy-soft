import {
  InventoryMovementKind,
  InvoicePaymentStatus,
  InvoiceStatus,
  MaterialKind,
  PaymentMethod,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import {
  decimalToString,
  getCurrentQty,
  parseDecimal,
  postSignedMovement,
} from "./inventory-service.js";

export const SALES_INVOICE_LINE_REF = "InvoiceItem";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type InvoiceLineComputed = {
  lineSubtotal: Decimal;
  lineTax: Decimal;
  lineTotal: Decimal;
};

export function computeLineAmounts(opts: {
  quantity: Decimal;
  unitPrice: Decimal;
  lineDiscount: Decimal;
  taxRate: Decimal;
}): InvoiceLineComputed {
  const base = opts.quantity.mul(opts.unitPrice).minus(opts.lineDiscount);
  if (base.lt(0)) {
    throw new Error("Ligne : sous-total après remise ligne négatif.");
  }
  const lineTax = base.mul(opts.taxRate).div(100);
  const lineTotal = base.add(lineTax);
  return { lineSubtotal: base, lineTax, lineTotal };
}

export function computeInvoiceHeader(opts: {
  lines: InvoiceLineComputed[];
  invoiceDiscount: Decimal;
}): { subtotalAmount: Decimal; taxAmount: Decimal; discountAmount: Decimal; totalAmount: Decimal } {
  let subtotalAmount = new Decimal(0);
  let taxAmount = new Decimal(0);
  for (const ln of opts.lines) {
    subtotalAmount = subtotalAmount.add(ln.lineSubtotal);
    taxAmount = taxAmount.add(ln.lineTax);
  }
  const gross = subtotalAmount.add(taxAmount).minus(opts.invoiceDiscount);
  if (gross.lt(0)) {
    throw new Error("Total facture négatif après remise globale.");
  }
  return {
    subtotalAmount,
    taxAmount,
    discountAmount: opts.invoiceDiscount,
    totalAmount: gross,
  };
}

export async function nextInvoiceNumber(prisma: DbClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const latest = await prisma.invoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  let seq = 1;
  if (latest?.number) {
    const parts = latest.number.slice(prefix.length);
    const n = Number.parseInt(parts, 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

function paymentStatusFromPaid(total: Decimal, paid: Decimal): InvoicePaymentStatus {
  if (paid.lte(0)) return InvoicePaymentStatus.UNPAID;
  if (paid.lt(total)) return InvoicePaymentStatus.PARTIAL;
  return InvoicePaymentStatus.PAID;
}

async function sumPayments(tx: DbClient, invoiceId: string): Promise<Decimal> {
  const agg = await tx.paymentRecord.aggregate({
    _sum: { amount: true },
    where: { invoiceId },
  });
  const s = agg._sum.amount;
  return s ?? new Decimal(0);
}

export async function recalculateDraftInvoice(prisma: DbClient, invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new Error("Recalcul interdit : facture figée.");
  }

  const disc = parseDecimal(decimalToString(invoice.discountAmount));
  const computedLines: InvoiceLineComputed[] = [];

  for (const item of invoice.items) {
    const qty = parseDecimal(decimalToString(item.quantity));
    const unitPrice = parseDecimal(decimalToString(item.unitPrice));
    const lineDiscount = parseDecimal(decimalToString(item.lineDiscount));
    const taxRate = parseDecimal(decimalToString(item.taxRate));
    computedLines.push(computeLineAmounts({ quantity: qty, unitPrice, lineDiscount, taxRate }));
  }

  const header = computeInvoiceHeader({ lines: computedLines, invoiceDiscount: disc });

  for (let i = 0; i < invoice.items.length; i++) {
    const item = invoice.items[i]!;
    const comp = computedLines[i]!;
    await prisma.invoiceItem.update({
      where: { id: item.id },
      data: {
        lineSubtotal: comp.lineSubtotal,
        lineTax: comp.lineTax,
        lineTotal: comp.lineTotal,
      },
    });
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      subtotalAmount: header.subtotalAmount,
      taxAmount: header.taxAmount,
      discountAmount: header.discountAmount,
      totalAmount: header.totalAmount,
    },
  });
}

export async function createInvoiceDraft(
  prisma: PrismaClient,
  params: {
    userId: string | null;
    customerId: string;
    issuedAt?: Date;
    dueAt?: Date | null;
    paymentMethod?: PaymentMethod | null;
    currencyCode?: string;
    discountAmount: Decimal;
    notes?: string | null;
    lines: Array<{
      productId?: string | null;
      labelFr: string;
      quantity: Decimal;
      unitPrice: Decimal;
      lineDiscount: Decimal;
      taxRate: Decimal;
      notes?: string | null;
    }>;
  },
): Promise<{ id: string; number: string }> {
  return prisma.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx);
    const invoice = await tx.invoice.create({
      data: {
        number,
        customerId: params.customerId,
        issuedAt: params.issuedAt ?? new Date(),
        dueAt: params.dueAt ?? null,
        status: InvoiceStatus.DRAFT,
        paymentStatus: InvoicePaymentStatus.UNPAID,
        paymentMethod: params.paymentMethod ?? null,
        currencyCode: params.currencyCode ?? "DZD",
        discountAmount: params.discountAmount,
        notes: params.notes ?? null,
        createdById: params.userId,
      },
      select: { id: true },
    });

    let order = 0;
    for (const line of params.lines) {
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          productId: line.productId ?? null,
          labelFr: line.labelFr.trim(),
          skuSnapshot: null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineDiscount: line.lineDiscount,
          taxRate: line.taxRate,
          notes: line.notes ?? null,
          sortOrder: order++,
        },
      });
    }

    await recalculateDraftInvoice(tx, invoice.id);

    return { id: invoice.id, number };
  });
}

export async function updateInvoiceDraftMeta(
  prisma: PrismaClient,
  params: {
    invoiceId: string;
    patch: {
      customerId?: string;
      issuedAt?: Date;
      dueAt?: Date | null;
      paymentMethod?: PaymentMethod | null;
      currencyCode?: string;
      discountAmount?: Decimal;
      notes?: string | null;
    };
  },
): Promise<void> {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: params.invoiceId } });
  if (inv.status !== InvoiceStatus.DRAFT) throw new Error("Modification interdite hors brouillon.");

  await prisma.invoice.update({
    where: { id: params.invoiceId },
    data: {
      ...(params.patch.customerId ? { customerId: params.patch.customerId } : {}),
      ...(params.patch.issuedAt ? { issuedAt: params.patch.issuedAt } : {}),
      ...(params.patch.dueAt !== undefined ? { dueAt: params.patch.dueAt } : {}),
      ...(params.patch.paymentMethod !== undefined ? { paymentMethod: params.patch.paymentMethod } : {}),
      ...(params.patch.currencyCode ? { currencyCode: params.patch.currencyCode } : {}),
      ...(params.patch.discountAmount ? { discountAmount: params.patch.discountAmount } : {}),
      ...(params.patch.notes !== undefined ? { notes: params.patch.notes } : {}),
    },
  });

  await recalculateDraftInvoice(prisma, params.invoiceId);
}

export async function replaceDraftInvoiceLines(
  prisma: PrismaClient,
  params: {
    invoiceId: string;
    lines: Array<{
      productId?: string | null;
      labelFr: string;
      quantity: Decimal;
      unitPrice: Decimal;
      lineDiscount: Decimal;
      taxRate: Decimal;
      notes?: string | null;
    }>;
  },
): Promise<void> {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: params.invoiceId } });
  if (inv.status !== InvoiceStatus.DRAFT) throw new Error("Lignes figées après validation.");

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: params.invoiceId } });
    let order = 0;
    for (const line of params.lines) {
      await tx.invoiceItem.create({
        data: {
          invoiceId: params.invoiceId,
          productId: line.productId ?? null,
          labelFr: line.labelFr.trim(),
          skuSnapshot: null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineDiscount: line.lineDiscount,
          taxRate: line.taxRate,
          notes: line.notes ?? null,
          sortOrder: order++,
        },
      });
    }
  });

  await recalculateDraftInvoice(prisma, params.invoiceId);
}

async function hydrateProductForLine(
  tx: DbClient,
  line: {
    productId: string | null;
    labelFr: string;
    quantity: Decimal;
  },
): Promise<{
  skuSnapshot: string | null;
  labelFr: string;
  packagingMaterialId: string | null;
  unit: string;
}> {
  if (!line.productId) {
    return { skuSnapshot: null, labelFr: line.labelFr, packagingMaterialId: null, unit: "UNIT" };
  }
  const product = await tx.product.findUnique({
    where: { id: line.productId },
    include: { packagingMaterial: true },
  });
  if (!product) throw new Error("Produit introuvable.");
  if (!product.isActive) throw new Error(`Produit inactif : ${product.sku}.`);
  return {
    skuSnapshot: product.sku,
    labelFr: product.name,
    packagingMaterialId: product.packagingMaterialId,
    unit: product.unit,
  };
}

export async function validateInvoice(
  prisma: PrismaClient,
  params: { invoiceId: string; userId: string | null },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: params.invoiceId },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    });

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new Error("Validation impossible : statut déjà traité.");
    }
    if (invoice.items.length === 0) throw new Error("Facture sans lignes.");

    await recalculateDraftInvoice(tx, invoice.id);

    const refreshed = await tx.invoice.findUniqueOrThrow({
      where: { id: params.invoiceId },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    });

    for (const item of refreshed.items) {
      const qty = parseDecimal(decimalToString(item.quantity));
      if (!qty.gt(0)) throw new Error("Quantité ligne invalide.");

      const hydrated = await hydrateProductForLine(tx, {
        productId: item.productId,
        labelFr: item.labelFr,
        quantity: qty,
      });

      if (hydrated.packagingMaterialId) {
        const pack = await tx.packagingMaterial.findUniqueOrThrow({
          where: { id: hydrated.packagingMaterialId },
        });
        if (pack.unit !== hydrated.unit) {
          throw new Error(`Unité stock incompatible pour ${pack.sku} (${pack.unit} vs ${hydrated.unit}).`);
        }
        const available = await getCurrentQty(tx, MaterialKind.PACKAGING, hydrated.packagingMaterialId);
        if (available.lt(qty)) {
          throw new Error(`Stock insuffisant pour ${pack.sku} : ${decimalToString(available)} < ${decimalToString(qty)}.`);
        }
      }

      await tx.invoiceItem.update({
        where: { id: item.id },
        data: {
          labelFr: hydrated.labelFr,
          skuSnapshot: hydrated.skuSnapshot,
        },
      });
    }

    const finalItems = await tx.invoiceItem.findMany({
      where: { invoiceId: invoice.id },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

    const itemsWithPack: Array<{ itemId: string; qty: Decimal; packagingId: string }> = [];
    for (const item of finalItems) {
      if (!item.productId) continue;
      const p = await tx.product.findUnique({
        where: { id: item.productId },
        select: { packagingMaterialId: true },
      });
      if (p?.packagingMaterialId) {
        itemsWithPack.push({ itemId: item.id, qty: parseDecimal(decimalToString(item.quantity)), packagingId: p.packagingMaterialId });
      }
    }

    for (const row of itemsWithPack) {
      await postSignedMovement({
        prisma: tx,
        materialKind: MaterialKind.PACKAGING,
        materialId: row.packagingId,
        qtySigned: row.qty.mul(-1),
        inventoryKind: InventoryMovementKind.SALES_OUT,
        referenceType: SALES_INVOICE_LINE_REF,
        referenceId: row.itemId,
        note: `Facture ${refreshed.number}`,
        userId: params.userId,
        occurredAt: refreshed.issuedAt,
      });
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.VALIDATED,
        validatedAt: new Date(),
        validatedById: params.userId,
      },
    });
  });
}

export async function cancelInvoice(
  prisma: PrismaClient,
  params: { invoiceId: string; userId: string | null },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: params.invoiceId },
      include: { payments: true, items: true },
    });

    if (invoice.status === InvoiceStatus.CANCELLED) return;

    const paid = await sumPayments(tx, invoice.id);
    if (paid.gt(0)) {
      throw new Error("Annulation impossible : paiements enregistrés.");
    }

    if (invoice.status === InvoiceStatus.DRAFT) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.CANCELLED, cancelledAt: new Date() },
      });
      return;
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new Error("Annulation impossible sur facture soldée.");
    }

    if (invoice.status === InvoiceStatus.VALIDATED) {
      const finalItems = await tx.invoiceItem.findMany({
        where: { invoiceId: invoice.id },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });

      for (const item of finalItems) {
        if (!item.productId) continue;
        const p = await tx.product.findUnique({
          where: { id: item.productId },
          select: { packagingMaterialId: true },
        });
        if (!p?.packagingMaterialId) continue;

        const qty = parseDecimal(decimalToString(item.quantity));
        await postSignedMovement({
          prisma: tx,
          materialKind: MaterialKind.PACKAGING,
          materialId: p.packagingMaterialId,
          qtySigned: qty,
          inventoryKind: InventoryMovementKind.RETURN_IN,
          referenceType: SALES_INVOICE_LINE_REF,
          referenceId: item.id,
          note: `Annulation vente · ${invoice.number}`,
          userId: params.userId,
          occurredAt: new Date(),
        });
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.CANCELLED,
          cancelledAt: new Date(),
          paymentStatus: InvoicePaymentStatus.UNPAID,
        },
      });
      return;
    }

    throw new Error("Transition d’annulation non prise en charge.");
  });
}

export async function registerPayment(
  prisma: PrismaClient,
  params: {
    invoiceId: string;
    userId: string | null;
    amount: Decimal;
    method: PaymentMethod;
    paidAt?: Date;
    reference?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: params.invoiceId } });

    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new Error("Paiement interdit sur brouillon — valider d’abord.");
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new Error("Paiement interdit sur facture annulée.");
    }

    const total = parseDecimal(decimalToString(invoice.totalAmount));
    const paidBefore = await sumPayments(tx, invoice.id);
    const remaining = total.minus(paidBefore);

    if (remaining.lte(0)) {
      throw new Error("Facture déjà réglée.");
    }

    if (params.amount.gt(remaining)) {
      throw new Error(`Montant excédentaire : reste ${decimalToString(remaining)}.`);
    }

    await tx.paymentRecord.create({
      data: {
        invoiceId: invoice.id,
        amount: params.amount,
        method: params.method,
        paidAt: params.paidAt ?? new Date(),
        reference: params.reference ?? null,
        notes: params.notes ?? null,
        recordedById: params.userId,
      },
    });

    const paidAfter = paidBefore.add(params.amount);
    const ps = paymentStatusFromPaid(total, paidAfter);

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paymentStatus: ps,
        paymentMethod: params.method,
        status: ps === InvoicePaymentStatus.PAID ? InvoiceStatus.PAID : InvoiceStatus.VALIDATED,
      },
    });
  });
}
