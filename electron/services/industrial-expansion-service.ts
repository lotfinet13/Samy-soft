import {
  BatchStatus,
  MachineStatus,
  MaintenanceScheduleStatus,
  MaterialKind,
  type MachineMaintenanceSchedule,
  type PrismaClient,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

import { decimalToString, getCurrentQty, parseDecimal } from "./inventory-service.js";

type ForecastInput = {
  materialKind: MaterialKind;
  materialId: string;
  horizonDays?: number;
};

export type PurchaseForecastResult = {
  materialKind: MaterialKind;
  materialId: string;
  sku: string | null;
  label: string | null;
  currentQty: Decimal;
  averageDailyUse: Decimal;
  daysRemaining: Decimal | null;
  recommendedReorderAt: Date | null;
  confidenceScore: Decimal;
};

export type IndustrialAnalyticsResult = {
  machineUtilizationPct: Decimal;
  productionEfficiencyScore: Decimal;
  laborEfficiencyScore: Decimal;
  throughputUnits: Decimal;
  metadata: Record<string, string | number>;
};

function daysBetween(start: Date, end: Date): number {
  const ms = Math.max(1, end.getTime() - start.getTime());
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

async function resolveMaterialSnapshot(
  prisma: PrismaClient,
  materialKind: MaterialKind,
  materialId: string,
): Promise<{ sku: string | null; label: string | null; supplierId: string | null }> {
  if (materialKind === MaterialKind.RAW) {
    const row = await prisma.rawMaterial.findUnique({
      where: { id: materialId },
      select: { sku: true, labelFr: true, supplierId: true },
    });
    return { sku: row?.sku ?? null, label: row?.labelFr ?? null, supplierId: row?.supplierId ?? null };
  }
  const row = await prisma.packagingMaterial.findUnique({
    where: { id: materialId },
    select: { sku: true, labelFr: true, supplierId: true },
  });
  return { sku: row?.sku ?? null, label: row?.labelFr ?? null, supplierId: row?.supplierId ?? null };
}

export async function computePurchaseForecast(
  prisma: PrismaClient,
  input: ForecastInput,
): Promise<PurchaseForecastResult> {
  const horizonDays = input.horizonDays ?? 90;
  const since = new Date(Date.now() - horizonDays * 86_400_000);
  const where =
    input.materialKind === MaterialKind.RAW
      ? { materialKind: input.materialKind, rawMaterialId: input.materialId, occurredAt: { gte: since } }
      : { materialKind: input.materialKind, packagingMaterialId: input.materialId, occurredAt: { gte: since } };

  const movements = await prisma.stockMovement.findMany({
    where,
    select: { qtySigned: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });
  const consumption = movements
    .filter((row) => parseDecimal(decimalToString(row.qtySigned)).lt(0))
    .reduce((acc, row) => acc.add(parseDecimal(decimalToString(row.qtySigned)).abs()), new Decimal(0));

  const divisor = movements[0] ? daysBetween(movements[0].occurredAt, new Date()) : horizonDays;
  const averageDailyUse = divisor > 0 ? consumption.div(divisor) : new Decimal(0);
  const currentQty = await getCurrentQty(prisma, input.materialKind, input.materialId);
  const daysRemaining = averageDailyUse.gt(0) ? currentQty.div(averageDailyUse) : null;
  const recommendedReorderAt = daysRemaining
    ? new Date(Date.now() + Math.max(0, daysRemaining.minus(3).toNumber()) * 86_400_000)
    : null;
  const confidenceScore = new Decimal(Math.min(1, movements.length / 30).toFixed(2));
  const snapshot = await resolveMaterialSnapshot(prisma, input.materialKind, input.materialId);

  return {
    materialKind: input.materialKind,
    materialId: input.materialId,
    sku: snapshot.sku,
    label: snapshot.label,
    currentQty,
    averageDailyUse,
    daysRemaining,
    recommendedReorderAt,
    confidenceScore,
  };
}

export async function savePurchaseForecastSnapshot(
  prisma: PrismaClient,
  input: ForecastInput,
): Promise<string> {
  const forecast = await computePurchaseForecast(prisma, input);
  const snapshot = await resolveMaterialSnapshot(prisma, input.materialKind, input.materialId);
  const row = await prisma.purchaseForecastSnapshot.create({
    data: {
      materialKind: input.materialKind,
      materialId: input.materialId,
      skuSnapshot: forecast.sku,
      labelSnapshot: forecast.label,
      currentQty: forecast.currentQty,
      averageDailyUse: forecast.averageDailyUse,
      daysRemaining: forecast.daysRemaining,
      recommendedReorderAt: forecast.recommendedReorderAt,
      supplierId: snapshot.supplierId,
      confidenceScore: forecast.confidenceScore,
      seasonalityJson: JSON.stringify({ horizonDays: input.horizonDays ?? 90 }),
    },
    select: { id: true },
  });
  return row.id;
}

export async function listDueMaintenance(
  prisma: PrismaClient,
  at: Date = new Date(),
): Promise<MachineMaintenanceSchedule[]> {
  return prisma.machineMaintenanceSchedule.findMany({
    where: {
      status: { in: [MaintenanceScheduleStatus.PLANNED, MaintenanceScheduleStatus.DUE] },
      nextDueAt: { lte: at },
      machine: { status: { not: MachineStatus.RETIRED } },
    },
    include: { machine: true },
    orderBy: [{ priority: "desc" }, { nextDueAt: "asc" }],
  });
}

export async function computeIndustrialAnalytics(
  prisma: PrismaClient,
  periodStart: Date,
  periodEnd: Date,
): Promise<IndustrialAnalyticsResult> {
  const [batches, downtimes, attendance] = await Promise.all([
    prisma.productionBatch.findMany({
      where: { status: BatchStatus.COMPLETED, finishedAt: { gte: periodStart, lte: periodEnd } },
      select: { plannedQty: true, producedQty: true, startedAt: true, finishedAt: true },
    }),
    prisma.machineDowntime.findMany({
      where: { startedAt: { lte: periodEnd }, OR: [{ endedAt: null }, { endedAt: { gte: periodStart } }] },
      select: { startedAt: true, endedAt: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { workedDate: { gte: periodStart, lte: periodEnd } },
      select: { totalWorkedHours: true },
    }),
  ]);

  const periodMinutes = new Decimal(daysBetween(periodStart, periodEnd)).mul(24 * 60);
  const downtimeMinutes = downtimes.reduce((acc, row) => {
    const end = row.endedAt ?? periodEnd;
    return acc.add(Math.max(0, Math.min(end.getTime(), periodEnd.getTime()) - Math.max(row.startedAt.getTime(), periodStart.getTime())) / 60_000);
  }, new Decimal(0));
  const machineUtilizationPct = periodMinutes.gt(0)
    ? Decimal.max(0, new Decimal(100).minus(downtimeMinutes.div(periodMinutes).mul(100)))
    : new Decimal(0);

  const planned = batches.reduce((acc, row) => acc.add(parseDecimal(decimalToString(row.plannedQty))), new Decimal(0));
  const produced = batches.reduce((acc, row) => acc.add(parseDecimal(decimalToString(row.producedQty ?? 0))), new Decimal(0));
  const productionEfficiencyScore = planned.gt(0) ? Decimal.min(100, produced.div(planned).mul(100)) : new Decimal(0);
  const laborHours = attendance.reduce(
    (acc, row) => acc.add(parseDecimal(decimalToString(row.totalWorkedHours ?? 0))),
    new Decimal(0),
  );
  const laborEfficiencyScore = laborHours.gt(0) ? Decimal.min(100, produced.div(laborHours).mul(10)) : new Decimal(0);

  return {
    machineUtilizationPct,
    productionEfficiencyScore,
    laborEfficiencyScore,
    throughputUnits: produced,
    metadata: {
      completedBatches: batches.length,
      downtimeMinutes: Number(decimalToString(downtimeMinutes)),
      laborHours: Number(decimalToString(laborHours)),
    },
  };
}

export async function saveIndustrialAnalyticsSnapshot(
  prisma: PrismaClient,
  periodStart: Date,
  periodEnd: Date,
): Promise<string> {
  const computed = await computeIndustrialAnalytics(prisma, periodStart, periodEnd);
  const row = await prisma.industrialAnalyticsSnapshot.create({
    data: {
      periodStart,
      periodEnd,
      machineUtilizationPct: computed.machineUtilizationPct,
      productionEfficiencyScore: computed.productionEfficiencyScore,
      laborEfficiencyScore: computed.laborEfficiencyScore,
      throughputUnits: computed.throughputUnits,
      metadata: JSON.stringify(computed.metadata),
    },
    select: { id: true },
  });
  return row.id;
}
