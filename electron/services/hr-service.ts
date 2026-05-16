import {
  AdvanceRepaymentStatus,
  PayrollCycleStatus,
  PayrollStatus,
  type PrismaClient,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

import { calculatePayrollForWorker } from "./payroll-engine.js";
import { decimalToString, parseDecimal } from "./inventory-service.js";

export function parseWorkedDateInput(raw: string): Date {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const parts = t.split("-").map(Number);
    const y = parts[0];
    const mo = parts[1];
    const d = parts[2];
    if (y === undefined || mo === undefined || d === undefined) throw new Error("Date invalide.");
    return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  }
  const dt = new Date(t);
  if (Number.isNaN(dt.getTime())) throw new Error("Date de présence invalide.");
  const y = dt.getFullYear();
  const mo = dt.getMonth();
  const day = dt.getDate();
  return new Date(Date.UTC(y, mo, day, 12, 0, 0));
}

/** Journée civile locale → date stockée (midi UTC) pour jointures présences. */
export function todayStoredWorkDate(): Date {
  const n = new Date();
  const key = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  return parseWorkedDateInput(key);
}

export async function outstandingAdvanceAmount(prisma: PrismaClient, advanceId: string): Promise<Decimal> {
  const adv = await prisma.salaryAdvance.findUnique({ where: { id: advanceId } });
  if (!adv) return new Decimal(0);
  const agg = await prisma.payrollAdvanceRecovery.aggregate({
    where: { salaryAdvanceId: advanceId },
    _sum: { amount: true },
  });
  const orig = parseDecimal(decimalToString(adv.amount));
  const repaid = parseDecimal(decimalToString(agg._sum.amount ?? 0));
  const out = orig.sub(repaid);
  return out.lt(0) ? new Decimal(0) : out;
}

export async function refreshAdvanceStatuses(prisma: PrismaClient, workerIds: string[]): Promise<void> {
  const uniq = [...new Set(workerIds)];
  for (const workerId of uniq) {
    const advances = await prisma.salaryAdvance.findMany({ where: { workerId } });
    for (const adv of advances) {
      if (adv.repaymentStatus === AdvanceRepaymentStatus.WRITTEN_OFF) continue;
      const out = await outstandingAdvanceAmount(prisma, adv.id);
      const orig = parseDecimal(decimalToString(adv.amount));
      let status: AdvanceRepaymentStatus = AdvanceRepaymentStatus.PENDING;
      if (out.lte(new Decimal("0.005"))) status = AdvanceRepaymentStatus.REPAID;
      else if (out.lt(orig)) status = AdvanceRepaymentStatus.PARTIAL;
      await prisma.salaryAdvance.update({
        where: { id: adv.id },
        data: { repaymentStatus: status },
      });
    }
  }
}

export async function computePayrollCycle(
  prisma: PrismaClient,
  cycleId: string,
): Promise<{ workersProcessed: number }> {
  const cycle = await prisma.payrollCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) throw new Error("Cycle introuvable.");
  if (cycle.status !== PayrollCycleStatus.DRAFT) throw new Error("Cycle verrouillé — recalcul interdit.");

  const workers = await prisma.worker.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  const touchedWorkers: string[] = [];

  for (const worker of workers) {
    const attendanceRows = await prisma.attendanceRecord.findMany({
      where: {
        workerId: worker.id,
        workedDate: { gte: cycle.periodStart, lte: cycle.periodEnd },
      },
    });

    let record = await prisma.payrollRecord.findFirst({
      where: { payrollCycleId: cycleId, workerId: worker.id },
      include: { adjustments: true },
    });

    const adjustments = record?.adjustments ?? [];

    const rawAdvances = await prisma.salaryAdvance.findMany({
      where: {
        workerId: worker.id,
        repaymentStatus: { notIn: [AdvanceRepaymentStatus.REPAID, AdvanceRepaymentStatus.WRITTEN_OFF] },
      },
    });

    const advancesOutstanding: { id: string; outstanding: Decimal }[] = [];
    for (const a of rawAdvances) {
      const agg = await prisma.payrollAdvanceRecovery.aggregate({
        where: { salaryAdvanceId: a.id },
        _sum: { amount: true },
      });
      const orig = parseDecimal(decimalToString(a.amount));
      const already = parseDecimal(decimalToString(agg._sum.amount ?? 0));
      let outstanding = orig.sub(already);
      if (record) {
        const thisCycleRecov = await prisma.payrollAdvanceRecovery.aggregate({
          where: { salaryAdvanceId: a.id, payrollRecordId: record.id },
          _sum: { amount: true },
        });
        outstanding = outstanding.add(parseDecimal(decimalToString(thisCycleRecov._sum.amount ?? 0)));
      }
      if (outstanding.gt(new Decimal("0.005"))) {
        advancesOutstanding.push({ id: a.id, outstanding });
      }
    }

    const result = calculatePayrollForWorker({
      worker,
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      attendanceRows,
      adjustments,
      advancesOutstanding,
    });

    await prisma.$transaction(async (tx) => {
      if (record) {
        await tx.payrollAdvanceRecovery.deleteMany({ where: { payrollRecordId: record.id } });
      }

      const meta = JSON.stringify({ snapshot: result.snapshot });

      if (!record) {
        record = await tx.payrollRecord.create({
          data: {
            payrollCycleId: cycleId,
            workerId: worker.id,
            periodStart: cycle.periodStart,
            periodEnd: cycle.periodEnd,
            grossAmount: result.grossAmount,
            overtimePay: result.overtimePay,
            deductions: result.deductions,
            advanceRecovery: result.advanceRecovery,
            netAmount: result.netAmount,
            metadata: meta,
            status: PayrollStatus.DRAFT,
          },
          include: { adjustments: true },
        });
      } else {
        record = await tx.payrollRecord.update({
          where: { id: record.id },
          data: {
            grossAmount: result.grossAmount,
            overtimePay: result.overtimePay,
            deductions: result.deductions,
            advanceRecovery: result.advanceRecovery,
            netAmount: result.netAmount,
            metadata: meta,
          },
          include: { adjustments: true },
        });
      }

      for (const r of result.recoveryPlan) {
        await tx.payrollAdvanceRecovery.create({
          data: {
            salaryAdvanceId: r.advanceId,
            payrollRecordId: record!.id,
            amount: r.amount,
          },
        });
      }
    });

    touchedWorkers.push(worker.id);
  }

  await refreshAdvanceStatuses(prisma, touchedWorkers);

  return { workersProcessed: workers.length };
}
