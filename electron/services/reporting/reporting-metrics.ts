import { Decimal, InventoryMovementKind, InvoiceStatus, type PrismaClient } from "../../prisma-client.js";

import { enumerateDatesInclusive, normalizeWorkDateUtc } from "../payroll-engine.js";
import { decimalToString, parseDecimal } from "../inventory-service.js";

export type ProfitabilityOverviewDTO = {
  periodLabel: string;
  revenueValidated: number;
  productionIngredientCost: number;
  productionLaborEstimate: number;
  productionOverheadEstimate: number;
  payrollNetOperational: number;
  wasteQtyRawUnits: number;
  wasteValueEstimate: number;
  expiryLossQtyUnits: number;
  expiryLossValueEstimate: number;
  grossMarginEstimate: number;
  netMarginEstimate: number;
  /** Part des coûts directs + paie rapportée au CA validé sur la fenêtre — indicateur cockpit. */
  costToRevenueRatio: number;
  productRanking: Array<{
    sku: string;
    name: string;
    revenue: number;
    qtySold: number;
    estimatedCost: number | null;
    marginEstimate: number | null;
  }>;
};

export type ManagementSummaryDTO = {
  currencyCode: string;
  estimatedMonthlyPl: Array<{
    monthKey: string;
    revenue: number;
    productionCostIngredient: number;
    payrollNet: number;
    netEstimate: number;
  }>;
  commercial: {
    invoiceCountValidated: number;
    averageBasket: number;
    unpaidOutstanding: number;
    partialOutstanding: number;
  };
};

export type KpiOverviewDTO = {
  window: { fromIso: string; toIso: string };
  currencyCode: string;
  dailyRevenue: Array<{ date: string; revenue: number }>;
  productionCostRatio: number;
  payrollBurden: number;
  inventoryTurnoverApprox: number;
  wastePctOfInboundQty: number;
  salesValidatedCount: number;
  completedBatches: number;
};

function overlapsRange(
  start: Date,
  end: Date,
  from: Date,
  to: Date,
): boolean {
  return normalizeWorkDateUtc(start).getTime() <= normalizeWorkDateUtc(to).getTime()
    && normalizeWorkDateUtc(end).getTime() >= normalizeWorkDateUtc(from).getTime();
}

function num(d: Decimal | unknown): number {
  return Number.parseFloat(decimalToString(d));
}

export async function computeProfitabilityOverview(
  prisma: PrismaClient,
  from: Date,
  to: Date,
  _currencyCode: string,
): Promise<ProfitabilityOverviewDTO> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
      OR: [
        {
          validatedAt: { gte: from, lte: to },
        },
        {
          validatedAt: null,
          issuedAt: { gte: from, lte: to },
        },
      ],
    },
    select: { totalAmount: true },
  });

  let revenue = new Decimal(0);
  for (const inv of invoices) revenue = revenue.add(parseDecimal(decimalToString(inv.totalAmount)));

  const batches = await prisma.productionBatch.findMany({
    where: {
      status: "COMPLETED",
      finishedAt: { not: null, gte: from, lte: to },
    },
    select: {
      costIngredientTotal: true,
      costLaborEstimate: true,
      costOverheadEstimate: true,
      producedQty: true,
      recipeId: true,
      metadata: true,
    },
  });

  let productionIngredientCost = new Decimal(0);
  let productionLaborEstimate = new Decimal(0);
  let productionOverheadEstimate = new Decimal(0);

  type RecipeAgg = {
    qty: Decimal;
    cost: Decimal;
  };
  const recipeCostRolling = new Map<string, RecipeAgg>();

  for (const b of batches) {
    if (b.costIngredientTotal != null)
      productionIngredientCost = productionIngredientCost.add(parseDecimal(decimalToString(b.costIngredientTotal)));
    if (b.costLaborEstimate != null)
      productionLaborEstimate = productionLaborEstimate.add(parseDecimal(decimalToString(b.costLaborEstimate)));
    if (b.costOverheadEstimate != null)
      productionOverheadEstimate = productionOverheadEstimate.add(parseDecimal(decimalToString(b.costOverheadEstimate)));

    if (b.producedQty != null && b.producedQty.gt(0) && b.costIngredientTotal != null) {
      const u = recipeCostRolling.get(b.recipeId);
      const addCost = parseDecimal(decimalToString(b.costIngredientTotal));
      const addQty = b.producedQty;
      if (!u) {
        recipeCostRolling.set(b.recipeId, { qty: addQty, cost: addCost });
      } else {
        recipeCostRolling.set(b.recipeId, {
          qty: u.qty.add(addQty),
          cost: u.cost.add(addCost),
        });
      }
    }
  }

  const payrollRows = await prisma.payrollRecord.findMany({
    where: {
      OR: [{ periodStart: { lte: to }, periodEnd: { gte: from } }],
    },
    select: {
      netAmount: true,
      periodStart: true,
      periodEnd: true,
      status: true,
    },
  });
  /** Paie hors brouillon, limitée aux périodes recoupant la fenêtre. */
  let payrollNetOperational = new Decimal(0);
  for (const r of payrollRows) {
    if (r.status === "DRAFT") continue;
    if (!overlapsRange(r.periodStart, r.periodEnd, from, to)) continue;
    payrollNetOperational = payrollNetOperational.add(parseDecimal(decimalToString(r.netAmount)));
  }

  const wasteMovements = await prisma.stockMovement.findMany({
    where: {
      occurredAt: { gte: from, lte: to },
      inventoryKind: InventoryMovementKind.PRODUCTION_WASTE,
      materialKind: "RAW",
    },
    include: {
      rawMaterial: true,
    },
    take: 5000,
  });

  let wasteQty = new Decimal(0);
  let wasteValue = new Decimal(0);
  for (const mv of wasteMovements) {
    const qty = parseDecimal(decimalToString(mv.qtySigned)).abs();
    wasteQty = wasteQty.add(qty);
    if (mv.rawMaterial) {
      const unitCost = parseDecimal(decimalToString(mv.rawMaterial.costPriceUnit));
      wasteValue = wasteValue.add(qty.mul(unitCost));
    }
  }

  const expiredMovements = await prisma.stockMovement.findMany({
    where: {
      occurredAt: { gte: from, lte: to },
      inventoryKind: InventoryMovementKind.EXPIRED_LOSS,
    },
    include: {
      rawMaterial: true,
      packagingMaterial: true,
    },
    take: 5000,
  });
  let expQty = new Decimal(0);
  let expValue = new Decimal(0);
  for (const mv of expiredMovements) {
    const qty = parseDecimal(decimalToString(mv.qtySigned)).abs();
    expQty = expQty.add(qty);
    const unit =
      mv.rawMaterial != null
        ? parseDecimal(decimalToString(mv.rawMaterial.costPriceUnit))
        : mv.packagingMaterial != null
          ? parseDecimal(decimalToString(mv.packagingMaterial.costPriceUnit))
          : new Decimal(0);
    expValue = expValue.add(qty.mul(unit));
  }

  const directOperationalCost = productionIngredientCost
    .add(productionLaborEstimate)
    .add(productionOverheadEstimate)
    .add(payrollNetOperational);

  /** Perte valeur approximée post-comptabilité opérationnelle (MP + péremption). */
  const lossOperational = wasteValue.add(expValue);
  const cogsOperational = directOperationalCost.add(lossOperational);

  const grossMarginEstimate = revenue.sub(cogsOperational);
  /** Marge étendue très indicative (écart non affecté hors coûts saisis). */
  const netMarginEstimate = grossMarginEstimate;
  const costToRevenueRatio = revenue.gt(0) ? cogsOperational.div(revenue).toNumber() : 0;

  const invoiceItems = await prisma.invoiceItem.findMany({
    where: {
      invoice: {
        status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
        OR: [
          { validatedAt: { gte: from, lte: to } },
          { validatedAt: null, issuedAt: { gte: from, lte: to } },
        ],
      },
    },
    select: {
      quantity: true,
      lineTotal: true,
      labelFr: true,
      product: {
        select: { sku: true, name: true, recipeId: true },
      },
    },
    take: 8000,
  });

  type ProdAgg = { revenue: Decimal; qty: Decimal; recipeId: string | null; name: string; sku: string };
  const byProductKey = new Map<string, ProdAgg>();
  for (const line of invoiceItems) {
    const key = `${line.product?.sku ?? "—"}|${line.product?.name ?? line.labelFr ?? "—"}`;
    const sku = line.product?.sku ?? "—";
    const name = line.product?.name ?? line.labelFr ?? "Article";
    const existing = byProductKey.get(key);
    const rev = parseDecimal(decimalToString(line.lineTotal));
    const qty = parseDecimal(decimalToString(line.quantity));
    if (!existing) {
      byProductKey.set(key, {
        sku,
        name,
        qty,
        revenue: rev,
        recipeId: line.product?.recipeId ?? null,
      });
    } else {
      existing.qty = existing.qty.add(qty);
      existing.revenue = existing.revenue.add(rev);
    }
  }

  const ranking: ProfitabilityOverviewDTO["productRanking"] = [];
  for (const [, row] of byProductKey.entries()) {
    let estimatedCost: number | null = null;
    if (row.recipeId) {
      const agg = recipeCostRolling.get(row.recipeId);
      if (agg && agg.qty.gt(0)) {
        const unitIng = agg.cost.div(agg.qty);
        estimatedCost = num(unitIng.mul(row.qty));
      }
    }
    const revenueN = num(row.revenue);
    const marginEstimate = estimatedCost == null ? null : revenueN - estimatedCost;
    ranking.push({
      sku: row.sku,
      name: row.name,
      revenue: revenueN,
      qtySold: num(row.qty),
      estimatedCost,
      marginEstimate,
    });
  }
  ranking.sort((a, b) => b.revenue - a.revenue);

  return {
    periodLabel: `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`,
    revenueValidated: num(revenue),
    productionIngredientCost: num(productionIngredientCost),
    productionLaborEstimate: num(productionLaborEstimate),
    productionOverheadEstimate: num(productionOverheadEstimate),
    payrollNetOperational: num(payrollNetOperational),
    wasteQtyRawUnits: num(wasteQty),
    wasteValueEstimate: num(wasteValue),
    expiryLossQtyUnits: num(expQty),
    expiryLossValueEstimate: num(expValue),
    grossMarginEstimate: num(grossMarginEstimate),
    netMarginEstimate: num(netMarginEstimate),
    costToRevenueRatio,
    productRanking: ranking.slice(0, 80),
  };
}

export async function computeManagementSummary(
  prisma: PrismaClient,
  currencyCode: string,
): Promise<ManagementSummaryDTO> {
  const now = normalizeWorkDateUtc(new Date());
  const horizonStart = new Date(now.getTime());
  horizonStart.setUTCMonth(now.getUTCMonth() - 5);
  horizonStart.setUTCDate(1);

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
      OR: [
        {
          validatedAt: { not: null, gte: horizonStart },
        },
        {
          validatedAt: null,
          issuedAt: { gte: horizonStart },
        },
      ],
    },
    select: {
      validatedAt: true,
      issuedAt: true,
      totalAmount: true,
      paymentStatus: true,
      status: true,
    },
  });

  type MonthBucket = { revenue: Decimal; unpaid: Decimal; invoiceCount: number };
  const byMonth = new Map<string, MonthBucket>();

  for (const inv of invoices) {
    const anchor = inv.validatedAt ?? inv.issuedAt;
    const mk = anchor.toISOString().slice(0, 7);
    const b = byMonth.get(mk) ?? { revenue: new Decimal(0), unpaid: new Decimal(0), invoiceCount: 0 };
    b.revenue = b.revenue.add(parseDecimal(decimalToString(inv.totalAmount)));
    b.invoiceCount += 1;
    if (
      inv.status !== InvoiceStatus.CANCELLED &&
      (inv.paymentStatus === "UNPAID" || inv.paymentStatus === "PARTIAL")
    ) {
      b.unpaid = b.unpaid.add(parseDecimal(decimalToString(inv.totalAmount)));
    }
    byMonth.set(mk, b);
  }

  const prodByMonthRows = await prisma.productionBatch.findMany({
    where: {
      status: "COMPLETED",
      finishedAt: { not: null, gte: horizonStart },
    },
    select: { finishedAt: true, costIngredientTotal: true },
  });
  const prodCostByMonth = new Map<string, Decimal>();
  for (const r of prodByMonthRows) {
    if (!r.finishedAt) continue;
    const mk = r.finishedAt.toISOString().slice(0, 7);
    if (r.costIngredientTotal == null) continue;
    const add = parseDecimal(decimalToString(r.costIngredientTotal));
    prodCostByMonth.set(mk, (prodCostByMonth.get(mk) ?? new Decimal(0)).add(add));
  }

  const payrollByMonthRows = await prisma.payrollRecord.findMany({
    where: {
      status: { in: ["VALIDATED", "PAID"] },
      periodEnd: { gte: horizonStart },
    },
    select: { periodEnd: true, netAmount: true },
  });
  const payrollCostByMonth = new Map<string, Decimal>();
  for (const r of payrollByMonthRows) {
    const mk = r.periodEnd.toISOString().slice(0, 7);
    const net = parseDecimal(decimalToString(r.netAmount));
    payrollCostByMonth.set(mk, (payrollCostByMonth.get(mk) ?? new Decimal(0)).add(net));
  }

  const months: string[] = [];
  let cursor = new Date(horizonStart.getTime());
  while (cursor <= now) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    cursor.setUTCDate(1);
  }

  const estimatedMonthlyPl: ManagementSummaryDTO["estimatedMonthlyPl"] = months.map((mk) => {
    const bucket = byMonth.get(mk) ?? { revenue: new Decimal(0), unpaid: new Decimal(0), invoiceCount: 0 };
    const pcost = prodCostByMonth.get(mk) ?? new Decimal(0);
    const pnet = payrollCostByMonth.get(mk) ?? new Decimal(0);
    const revenueN = num(bucket.revenue);
    return {
      monthKey: mk,
      revenue: revenueN,
      productionCostIngredient: num(pcost),
      payrollNet: num(pnet),
      netEstimate: revenueN - num(pcost) - num(pnet),
    };
  });

  const openBalanceRows = await prisma.invoice.findMany({
    where: {
      paymentStatus: { in: ["UNPAID", "PARTIAL"] },
      status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
    },
    select: { totalAmount: true, payments: true, paymentStatus: true },
    take: 5000,
  });
  /** Solde résiduel simple (sans rechargement paiements ligne par ligne ici pour perf). */
  let unpaidOutstanding = new Decimal(0);
  let partialOutstanding = new Decimal(0);

  for (const inv of openBalanceRows) {
    const total = parseDecimal(decimalToString(inv.totalAmount));
    let paid = new Decimal(0);
    if (inv.payments?.length) {
      for (const pmt of inv.payments) paid = paid.add(parseDecimal(decimalToString(pmt.amount)));
    }
    const dueRaw = total.sub(paid);
    const due = dueRaw.isNegative() ? new Decimal(0) : dueRaw;
    if (inv.paymentStatus === "UNPAID") unpaidOutstanding = unpaidOutstanding.add(due);
    else partialOutstanding = partialOutstanding.add(due);
  }

  const totalInvValidated = invoices.length;
  let revenueSumForAvg = new Decimal(0);
  for (const inv of invoices) {
    revenueSumForAvg = revenueSumForAvg.add(parseDecimal(decimalToString(inv.totalAmount)));
  }
  const avgBasket =
    totalInvValidated > 0 ? num(revenueSumForAvg.div(new Decimal(totalInvValidated))) : 0;

  return {
    currencyCode,
    estimatedMonthlyPl,
    commercial: {
      invoiceCountValidated: totalInvValidated,
      averageBasket: avgBasket,
      unpaidOutstanding: num(unpaidOutstanding),
      partialOutstanding: num(partialOutstanding),
    },
  };
}

export async function computeKpiOverview(
  prisma: PrismaClient,
  from: Date,
  to: Date,
  currencyCode: string,
): Promise<KpiOverviewDTO> {
  const dates = enumerateDatesInclusive(from, to);
  type DayMap = Map<string, Decimal>;
  const revenueByDay: DayMap = new Map();

  const invoicesDaily = await prisma.invoice.findMany({
    where: {
      status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
      OR: [
        { validatedAt: { not: null, gte: from, lte: to } },
        { validatedAt: null, issuedAt: { gte: from, lte: to } },
      ],
    },
    select: {
      validatedAt: true,
      issuedAt: true,
      totalAmount: true,
    },
  });

  for (const inv of invoicesDaily) {
    const d = normalizeWorkDateUtc(inv.validatedAt ?? inv.issuedAt);
    const key = dateKeyUtc(d);
    const add = parseDecimal(decimalToString(inv.totalAmount));
    revenueByDay.set(key, (revenueByDay.get(key) ?? new Decimal(0)).add(add));
  }

  const dailyRevenue: KpiOverviewDTO["dailyRevenue"] = dates.map((d) => {
    const key = dateKeyUtc(d);
    return { date: key, revenue: num(revenueByDay.get(key) ?? new Decimal(0)) };
  });

  const turnoverWindow = dates.length >= 14 ? dates.slice(-14) : dates;
  let revWindow = new Decimal(0);
  const dailyKeysTurn = turnoverWindow.map((d) => dateKeyUtc(normalizeWorkDateUtc(d)));

  dailyKeysTurn.forEach((key) => {
    revWindow = revWindow.add(revenueByDay.get(key) ?? new Decimal(0));
  });

  const batches = await prisma.productionBatch.count({
    where: {
      status: "COMPLETED",
      finishedAt: { not: null, gte: from, lte: to },
    },
  });

  const batchCosts = await prisma.productionBatch.aggregate({
    where: {
      status: "COMPLETED",
      finishedAt: { not: null, gte: from, lte: to },
      costIngredientTotal: { not: null },
    },
    _sum: { costIngredientTotal: true },
  });

  const prodCostIngredient = batchCosts._sum.costIngredientTotal
    ? parseDecimal(decimalToString(batchCosts._sum.costIngredientTotal))
    : new Decimal(0);

  const payrollAgg = await prisma.payrollRecord.aggregate({
    where: {
      status: { in: ["VALIDATED", "PAID"] },
      periodStart: { lte: to },
      periodEnd: { gte: from },
    },
    _sum: { netAmount: true },
  });

  const payrollBurdenDenom = payrollAgg._sum.netAmount
    ? parseDecimal(decimalToString(payrollAgg._sum.netAmount))
    : new Decimal(0);

  const turnoverWindowDates = turnoverWindow.length > 0 ? turnoverWindow : dates.length > 0 ? dates : [from];
  const tw0 = turnoverWindowDates[0] ?? from;
  const twLast = turnoverWindowDates[turnoverWindowDates.length - 1] ?? tw0;
  const windowFromUtc = normalizeWorkDateUtc(tw0);
  const windowEndDay = normalizeWorkDateUtc(twLast);
  const windowToUtc = new Date(Date.UTC(windowEndDay.getUTCFullYear(), windowEndDay.getUTCMonth(), windowEndDay.getUTCDate(), 23, 59, 59, 999));

  const purchaseAgg = await prisma.purchaseEntry.aggregate({
    where: {
      purchaseDate: { gte: windowFromUtc, lte: windowToUtc },
    },
    _sum: { totalAmount: true },
  });
  const inboundPurchaseValue =
    purchaseAgg._sum.totalAmount != null ? parseDecimal(decimalToString(purchaseAgg._sum.totalAmount)) : new Decimal(0);

  /** CA sub-période / volume achats magasiné : indicateur de tension opérationnelle. */
  const inventoryTurnoverApprox = inboundPurchaseValue.gt(0) ? num(revWindow.div(inboundPurchaseValue)) : num(revWindow);

  const movementsIn = await prisma.stockMovement.groupBy({
    by: ["rawMaterialId", "inventoryKind"],
    where: {
      occurredAt: { gte: from, lte: to },
      materialKind: "RAW",
      inventoryKind: { in: ["PURCHASE_IN", "PRODUCTION_IN", "RETURN_IN"] },
      rawMaterialId: { not: null },
    },
    _sum: {
      qtySigned: true,
    },
  });

  let inboundQtyProxy = new Decimal(0);
  for (const g of movementsIn) {
    if (!g.rawMaterialId) continue;
    inboundQtyProxy = inboundQtyProxy.add(parseDecimal(decimalToString(g._sum.qtySigned ?? 0)).abs());
  }

  const wasteGrouped = await prisma.stockMovement.groupBy({
    by: ["rawMaterialId"],
    where: {
      occurredAt: { gte: from, lte: to },
      inventoryKind: InventoryMovementKind.PRODUCTION_WASTE,
    },
    _sum: { qtySigned: true },
  });

  let wasteQty = new Decimal(0);
  for (const g of wasteGrouped) {
    wasteQty = wasteQty.add(parseDecimal(decimalToString(g._sum.qtySigned ?? 0)).abs());
  }

  const wastePct = inboundQtyProxy.gt(0) ? wasteQty.div(inboundQtyProxy).mul(100).toNumber() : 0;
  const productionCostRatio =
    revWindow.gt(0) ? prodCostIngredient.div(revWindow).toNumber() : 0;

  const payrollBurden =
    revWindow.gt(0) ? payrollBurdenDenom.div(revWindow).toNumber() : payrollBurdenDenom.gt(0) ? payrollBurdenDenom.toNumber() : 0;

  return {
    window: { fromIso: from.toISOString(), toIso: to.toISOString() },
    currencyCode,
    dailyRevenue,
    productionCostRatio,
    payrollBurden,
    inventoryTurnoverApprox,
    wastePctOfInboundQty: wastePct,
    salesValidatedCount: invoicesDaily.length,
    completedBatches: batches,
  };
}

function dateKeyUtc(d: Date): string {
  return normalizeWorkDateUtc(d).toISOString().slice(0, 10);
}
