import { AttendanceStatus, Decimal, InvoiceStatus, type PrismaClient } from "../../prisma-client.js";

import { decimalToString, parseDecimal } from "../inventory-service.js";
import { normalizeWorkDateUtc } from "../payroll-engine.js";

/** Séries préparées pour Recharts (valeurs primitives). */

export type InventoryAnalyticsDTO = {
  purchaseValueWeekly: Array<{ week: string; amount: number }>;
  expiryLossWeekly: Array<{ week: string; qty: number; valueEstimate: number }>;
  supplierDependency: Array<{ supplierName: string; purchaseValue: number; pct: number }>;
  inboundValueApprox: number;
};

export type ProductionAnalyticsDTO = {
  batchEfficiency: Array<{ batchCode: string; planned: number; produced: number; efficiencyPct: number }>;
  wasteTrendWeekly: Array<{ week: string; qty: number }>;
  operatorProductivity: Array<{ operatorName: string; sessions: number; runtimeMinutes: number }>;
};

export type HrAnalyticsDTO = {
  attendanceStatusWeekly: Array<{
    week: string;
    presentOrEquivalent: number;
    absentEquivalent: number;
    overtimeMarked: number;
  }>;
  overtimeMonthlyHours: Array<{ month: string; hours: number }>;
  payrollNetMonthly: Array<{ month: string; netAmount: number; recordCount: number }>;
};

export type SalesAnalyticsDTO = {
  revenueWeekly: Array<{ week: string; revenue: number }>;
  topCustomers: Array<{ name: string; revenue: number; invoiceCount: number }>;
  topProducts: Array<{ sku: string; name: string; qtySold: number; revenue: number }>;
  unpaidSnapshot: {
    unpaidCount: number;
    partialCount: number;
    outstandingEstimated: number;
  };
};

function num(d: unknown): number {
  return Number.parseFloat(decimalToString(d));
}

export function isoWeekKey(d: Date): string {
  const x = normalizeWorkDateUtc(d);
  const t = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function monthKeyUtc(d: Date): string {
  return normalizeWorkDateUtc(d).toISOString().slice(0, 7);
}

function aggregateNumberSeries<T extends Record<string, string | number>, K extends keyof T>(
  rows: Array<T>,
  keyField: K,
): Array<T> {
  const map = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    const k = String(row[keyField]);
    const existing = map.get(k);
    if (!existing) {
      map.set(k, { ...(row as Record<string, string | number>) });
      continue;
    }
    for (const field of Object.keys(row) as Array<keyof T>) {
      if (field === keyField) continue;
      const bv = row[field];
      const av = existing[field as string];
      if (typeof bv === "number") {
        existing[field as string] = (typeof av === "number" ? av : 0) + bv;
      }
    }
    map.set(k, existing);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row as T);
}

export async function computeInventoryAnalytics(
  prisma: PrismaClient,
  from: Date,
  to: Date,
): Promise<InventoryAnalyticsDTO> {
  const purchases = await prisma.purchaseEntry.findMany({
    where: { purchaseDate: { gte: from, lte: to } },
    select: { purchaseDate: true, totalAmount: true },
    take: 4000,
  });

  let inboundApprox = new Decimal(0);

  type Pw = { week: string; amount: number };

  const purchaseValueWeeklyRaw: Pw[] = [];
  purchases.forEach((pe) => {
    const amt = parseDecimal(decimalToString(pe.totalAmount));
    inboundApprox = inboundApprox.add(amt);
    purchaseValueWeeklyRaw.push({
      week: isoWeekKey(pe.purchaseDate),
      amount: num(amt),
    });
  });

  const purchaseValueWeekly = aggregateNumberSeries(purchaseValueWeeklyRaw, "week");

  const expiryRows = await prisma.stockMovement.findMany({
    where: {
      inventoryKind: "EXPIRED_LOSS",
      occurredAt: { gte: from, lte: to },
    },
    include: { rawMaterial: true, packagingMaterial: true },
    take: 5000,
  });

  type EL = { week: string; qty: number; valueEstimate: number };
  const expiryLossWeeklyRaw: EL[] = [];
  for (const mv of expiryRows) {
    const qty = parseDecimal(decimalToString(mv.qtySigned)).abs();
    const unit =
      mv.rawMaterial != null
        ? parseDecimal(decimalToString(mv.rawMaterial.costPriceUnit))
        : mv.packagingMaterial != null
          ? parseDecimal(decimalToString(mv.packagingMaterial.costPriceUnit))
          : new Decimal(0);
    expiryLossWeeklyRaw.push({
      week: isoWeekKey(mv.occurredAt),
      qty: num(qty),
      valueEstimate: num(qty.mul(unit)),
    });
  }

  const expiryLossWeekly = aggregateNumberSeries(expiryLossWeeklyRaw, "week").slice(-26);

  const suppliers = await prisma.purchaseEntry.groupBy({
    by: ["supplierId"],
    where: { purchaseDate: { gte: from, lte: to } },
    _sum: { totalAmount: true },
  });

  let totalPurchase = new Decimal(0);
  const bySupplierAmount = new Map<string, Decimal>();
  for (const row of suppliers) {
    const v = parseDecimal(decimalToString(row._sum.totalAmount ?? 0));
    totalPurchase = totalPurchase.add(v);
    bySupplierAmount.set(row.supplierId, v);
  }

  const ids = [...bySupplierAmount.keys()];
  const supNames = ids.length
    ? await prisma.supplier.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];

  const supplierDependency = supNames
    .map((s) => {
      const amt = num(bySupplierAmount.get(s.id) ?? 0);
      return {
        supplierName: s.name,
        purchaseValue: amt,
        pct: totalPurchase.gt(0) ? amt / num(totalPurchase) : 0,
      };
    })
    .sort((a, b) => b.purchaseValue - a.purchaseValue)
    .slice(0, 24);

  return {
    purchaseValueWeekly,
    expiryLossWeekly,
    supplierDependency,
    inboundValueApprox: num(inboundApprox),
  };
}

export async function computeProductionAnalytics(
  prisma: PrismaClient,
  from: Date,
  to: Date,
): Promise<ProductionAnalyticsDTO> {
  const completed = await prisma.productionBatch.findMany({
    where: {
      status: "COMPLETED",
      finishedAt: { not: null, gte: from, lte: to },
    },
    select: {
      code: true,
      plannedQty: true,
      producedQty: true,
      finishedAt: true,
    },
    take: 500,
    orderBy: { finishedAt: "desc" },
  });

  const batchEfficiency = completed.map((b) => {
    const planned = num(b.plannedQty);
    const produced = b.producedQty != null ? num(b.producedQty) : planned;
    const eff = planned > 0 ? Math.min(200, Math.max(0, (produced / planned) * 100)) : produced > 0 ? 100 : 0;
    return { batchCode: b.code, planned, produced, efficiencyPct: eff };
  });

  const wasteWeeklyRaw: Array<{ week: string; qty: number }> = [];
  const wasteDays = await prisma.stockMovement.findMany({
    where: {
      occurredAt: { gte: from, lte: to },
      inventoryKind: "PRODUCTION_WASTE",
    },
    select: { occurredAt: true, qtySigned: true },
    take: 5000,
  });
  wasteDays.forEach((w) =>
    wasteWeeklyRaw.push({
      week: isoWeekKey(w.occurredAt),
      qty: parseDecimal(decimalToString(w.qtySigned)).abs().toNumber(),
    }),
  );

  const wasteTrendWeekly = aggregateNumberSeries(wasteWeeklyRaw, "week").slice(-26);

  const logs = await prisma.productionOperationLog.findMany({
    where: {
      startedAt: { gte: from, lte: to },
      operatorId: { not: null },
    },
    include: { operator: true },
    take: 2000,
  });

  type Og = { name: string; sessions: number; runtime: number };
  const agg = new Map<string, Og>();
  for (const lg of logs) {
    const id = lg.operatorId ?? "?";
    const name = lg.operator?.displayName ?? lg.operator?.username ?? "Opérateur";
    const cur = agg.get(id) ?? { name, sessions: 0, runtime: 0 };
    cur.sessions += 1;
    cur.runtime += lg.runtimeMinutes ?? 0;
    agg.set(id, cur);
  }
  const operatorProductivity = [...agg.values()]
    .map((row) => ({ operatorName: row.name, sessions: row.sessions, runtimeMinutes: row.runtime }))
    .sort((a, b) => b.runtimeMinutes - a.runtimeMinutes)
    .slice(0, 25);

  return {
    batchEfficiency: batchEfficiency.slice(0, 40),
    wasteTrendWeekly,
    operatorProductivity,
  };
}

export async function computeHrAnalytics(
  prisma: PrismaClient,
  from: Date,
  to: Date,
): Promise<HrAnalyticsDTO> {
  const att = await prisma.attendanceRecord.findMany({
    where: { workedDate: { gte: from, lte: to } },
    select: { workedDate: true, status: true, overtimeHours: true },
    take: 8000,
  });

  type WK = Map<
    string,
    { presentOrEquivalent: number; absentEquivalent: number; overtimeMarked: number }
  >;
  const weeks: WK = new Map();
  const presentLike: AttendanceStatus[] = [
    AttendanceStatus.PRESENT,
    AttendanceStatus.LATE,
    AttendanceStatus.HALF_DAY,
    AttendanceStatus.OVERTIME,
    AttendanceStatus.VACATION,
  ];
  for (const r of att) {
    const wk = isoWeekKey(normalizeWorkDateUtc(r.workedDate));
    const cur =
      weeks.get(wk) ??
      ({
        presentOrEquivalent: 0,
        absentEquivalent: 0,
        overtimeMarked: 0,
      });
    const nx = {
      presentOrEquivalent: cur.presentOrEquivalent + (presentLike.includes(r.status) ? 1 : 0),
      absentEquivalent: cur.absentEquivalent + (r.status === AttendanceStatus.ABSENT ? 1 : 0),
      overtimeMarked:
        cur.overtimeMarked +
        (r.overtimeHours && parseDecimal(decimalToString(r.overtimeHours)).gt(0) ? 1 : 0),
    };
    weeks.set(wk, nx);
  }

  const attendanceStatusWeekly = [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({ week, ...v }))
    .slice(-52);

  const overtimeMonthly = new Map<string, Decimal>();

  att.forEach((r) => {
    const mh = `${monthKeyUtc(r.workedDate)}`;
    const hrs = parseDecimal(decimalToString(r.overtimeHours ?? 0));
    overtimeMonthly.set(mh, (overtimeMonthly.get(mh) ?? new Decimal(0)).add(hrs));
  });

  const overtimeMonthlyHours = [...overtimeMonthly.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({ month, hours: num(d) }));

  const payrollRows = await prisma.payrollRecord.findMany({
    where: {
      status: { in: ["VALIDATED", "PAID"] },
      periodEnd: { gte: from, lte: to },
    },
    select: { periodEnd: true, netAmount: true },
    take: 500,
  });

  const pmNet = new Map<string, { net: Decimal; cnt: number }>();
  payrollRows.forEach((r) => {
    const mk = monthKeyUtc(r.periodEnd);
    const cur = pmNet.get(mk) ?? { net: new Decimal(0), cnt: 0 };
    cur.net = cur.net.add(parseDecimal(decimalToString(r.netAmount)));
    cur.cnt += 1;
    pmNet.set(mk, cur);
  });

  const payrollNetMonthly = [...pmNet.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, row]) => ({ month, netAmount: num(row.net), recordCount: row.cnt }));

  return {
    attendanceStatusWeekly,
    overtimeMonthlyHours: overtimeMonthlyHours.slice(-18),
    payrollNetMonthly,
  };
}

export async function computeSalesAnalytics(
  prisma: PrismaClient,
  from: Date,
  to: Date,
): Promise<SalesAnalyticsDTO> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
      OR: [
        { validatedAt: { not: null, gte: from, lte: to } },
        { validatedAt: null, issuedAt: { gte: from, lte: to } },
      ],
    },
    select: {
      totalAmount: true,
      customer: { select: { name: true } },
      issuedAt: true,
      validatedAt: true,
    },
    take: 4000,
  });

  const revenueWeeklyRaw: Array<{ week: string; revenue: number }> = [];

  type Cat = Map<string, { name: string; revenue: Decimal; invoices: number }>;
  const cust: Cat = new Map();

  invoices.forEach((inv) => {
    const iso = isoWeekKey(inv.validatedAt ?? inv.issuedAt);
    revenueWeeklyRaw.push({ week: iso, revenue: num(inv.totalAmount) });
    const nm = inv.customer.name;
    const cur = cust.get(nm) ?? { name: nm, revenue: new Decimal(0), invoices: 0 };
    cur.revenue = cur.revenue.add(parseDecimal(decimalToString(inv.totalAmount)));
    cur.invoices += 1;
    cust.set(nm, cur);
  });

  const revenueWeekly = aggregateNumberSeries(revenueWeeklyRaw, "week").slice(-26);
  const topCustomers = [...cust.values()]
    .map((c) => ({ name: c.name, revenue: num(c.revenue), invoiceCount: c.invoices }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  const items = await prisma.invoiceItem.findMany({
    where: {
      invoice: {
        status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
        OR: [
          { validatedAt: { not: null, gte: from, lte: to } },
          { validatedAt: null, issuedAt: { gte: from, lte: to } },
        ],
      },
    },
    select: {
      quantity: true,
      lineTotal: true,
      labelFr: true,
      product: { select: { sku: true, name: true } },
    },
    take: 6000,
  });

  type Pm = Map<string, { sku: string; name: string; qty: Decimal; revenue: Decimal }>;
  const pmap: Pm = new Map();

  items.forEach((it) => {
    const sku = it.product?.sku ?? it.labelFr.slice(0, 32);
    const name = it.product?.name ?? it.labelFr;
    const cur = pmap.get(sku) ?? { sku, name, qty: new Decimal(0), revenue: new Decimal(0) };
    cur.qty = cur.qty.add(parseDecimal(decimalToString(it.quantity)));
    cur.revenue = cur.revenue.add(parseDecimal(decimalToString(it.lineTotal)));
    pmap.set(sku, cur);
  });

  const topProducts = [...pmap.values()]
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      qtySold: num(p.qty),
      revenue: num(p.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  const open = await prisma.invoice.findMany({
    where: {
      paymentStatus: { in: ["UNPAID", "PARTIAL"] },
      status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] },
    },
    select: {
      paymentStatus: true,
      totalAmount: true,
      payments: true,
    },
    take: 3000,
  });

  let unpaidCount = 0;
  let partialCount = 0;
  let outstandingEstimated = new Decimal(0);

  open.forEach((inv) => {
    const total = parseDecimal(decimalToString(inv.totalAmount));
    let paid = new Decimal(0);
    inv.payments.forEach((pm) => {
      paid = paid.add(parseDecimal(decimalToString(pm.amount)));
    });
    const dueRaw = total.sub(paid);
    const due = dueRaw.isNegative() ? new Decimal(0) : dueRaw;
    outstandingEstimated = outstandingEstimated.add(due);
    if (inv.paymentStatus === "UNPAID") unpaidCount += 1;
    if (inv.paymentStatus === "PARTIAL") partialCount += 1;
  });

  return {
    revenueWeekly,
    topCustomers,
    topProducts,
    unpaidSnapshot: {
      unpaidCount,
      partialCount,
      outstandingEstimated: num(outstandingEstimated),
    },
  };
}
