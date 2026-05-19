import {
  AttendanceStatus,
  Decimal,
  PayrollAdjustmentKind,
  SalaryType,
  type AttendanceRecord,
  type PayrollAdjustment,
  type Worker,
} from "../prisma-client.js";

import { decimalToString, parseDecimal } from "./inventory-service.js";

export function normalizeWorkDateUtc(d: Date): Date {
  const y = d.getFullYear();
  const mo = d.getMonth();
  const day = d.getDate();
  return new Date(Date.UTC(y, mo, day, 12, 0, 0));
}

export function dateKeyUtc(d: Date): string {
  return normalizeWorkDateUtc(d).toISOString().slice(0, 10);
}

export function enumerateDatesInclusive(start: Date, end: Date): Date[] {
  const s = normalizeWorkDateUtc(start).getTime();
  const e = normalizeWorkDateUtc(end).getTime();
  if (e < s) return [];
  const out: Date[] = [];
  for (let t = s; t <= e; t += 86400000) {
    out.push(new Date(t));
  }
  return out;
}

export function attendancePayFraction(status: AttendanceStatus): number {
  switch (status) {
    case AttendanceStatus.PRESENT:
    case AttendanceStatus.LATE:
    case AttendanceStatus.OVERTIME:
    case AttendanceStatus.VACATION:
      return 1;
    case AttendanceStatus.HALF_DAY:
      return 0.5;
    case AttendanceStatus.ABSENT:
    case AttendanceStatus.SICK_LEAVE:
      return 0;
    default:
      return 1;
  }
}

export type PayrollComputationResult = {
  baseGross: Decimal;
  overtimePay: Decimal;
  grossAmount: Decimal;
  deductions: Decimal;
  advanceRecovery: Decimal;
  correctionNet: Decimal;
  netAmount: Decimal;
  recoveryPlan: Array<{ advanceId: string; amount: Decimal }>;
  snapshot: Record<string, unknown>;
};

export function calculatePayrollForWorker(opts: {
  worker: Pick<Worker, "salaryType" | "baseSalary" | "dailyWage" | "overtimeRate">;
  periodStart: Date;
  periodEnd: Date;
  attendanceRows: Pick<AttendanceRecord, "workedDate" | "status" | "overtimeHours">[];
  adjustments: Pick<PayrollAdjustment, "kind" | "amount">[];
  advancesOutstanding: Array<{ id: string; outstanding: Decimal }>;
}): PayrollComputationResult {
  const { worker, periodStart, periodEnd, attendanceRows, adjustments, advancesOutstanding } = opts;

  const overtimeRateHr = worker.overtimeRate
    ? parseDecimal(decimalToString(worker.overtimeRate))
    : new Decimal(0);

  let overtimePay = new Decimal(0);
  for (const r of attendanceRows) {
    const hrs = parseDecimal(decimalToString(r.overtimeHours ?? 0));
    overtimePay = overtimePay.add(hrs.mul(overtimeRateHr));
  }

  const byDay = new Map<string, AttendanceStatus>();
  for (const r of attendanceRows) {
    byDay.set(dateKeyUtc(r.workedDate), r.status);
  }

  const dates = enumerateDatesInclusive(periodStart, periodEnd);
  let paidFrac = new Decimal(0);
  for (const day of dates) {
    const key = dateKeyUtc(day);
    const st = byDay.get(key);
    let frac: number;
    if (worker.salaryType === SalaryType.MONTHLY) {
      frac = st === undefined ? 1 : attendancePayFraction(st);
    } else {
      frac = st === undefined ? 0 : attendancePayFraction(st);
    }
    paidFrac = paidFrac.add(frac);
  }

  const denom = new Decimal(Math.max(1, dates.length));

  let baseGross = new Decimal(0);
  if (worker.salaryType === SalaryType.MONTHLY) {
    const base = worker.baseSalary ? parseDecimal(decimalToString(worker.baseSalary)) : new Decimal(0);
    baseGross = base.mul(paidFrac).div(denom);
  } else {
    const dw = worker.dailyWage ? parseDecimal(decimalToString(worker.dailyWage)) : new Decimal(0);
    baseGross = dw.mul(paidFrac);
  }

  let bonus = new Decimal(0);
  let deduction = new Decimal(0);
  let correctionNet = new Decimal(0);

  for (const a of adjustments) {
    const amt = parseDecimal(decimalToString(a.amount));
    if (a.kind === PayrollAdjustmentKind.BONUS) bonus = bonus.add(amt);
    else if (a.kind === PayrollAdjustmentKind.DEDUCTION) deduction = deduction.add(amt);
    else correctionNet = correctionNet.add(amt);
  }

  const grossAmount = baseGross.add(overtimePay).add(bonus);

  if (grossAmount.lt(0)) {
    throw new Error("Salaire brut calculé invalide (négatif).");
  }

  let pool = grossAmount.sub(deduction);
  if (pool.lt(0)) {
    throw new Error("Retenues supérieures au brut — vérifiez les ajustements.");
  }

  let advanceRecovery = new Decimal(0);
  const recoveryPlan: Array<{ advanceId: string; amount: Decimal }> = [];

  for (const adv of advancesOutstanding) {
    if (pool.lte(0)) break;
    const take = Decimal.min(adv.outstanding, pool);
    if (take.gt(0)) {
      recoveryPlan.push({ advanceId: adv.id, amount: take });
      advanceRecovery = advanceRecovery.add(take);
      pool = pool.sub(take);
    }
  }

  const netAmount = grossAmount.sub(deduction).sub(advanceRecovery).add(correctionNet);

  const snapshot = {
    formulaVersion: 1 as const,
    periodDayCount: dates.length,
    paidDayUnits: paidFrac.toFixed(4),
    salaryType: worker.salaryType,
    baseGross: decimalToString(baseGross),
    overtimePay: decimalToString(overtimePay),
    bonusAdjustments: decimalToString(bonus),
    deductionAdjustments: decimalToString(deduction),
    correctionNet: decimalToString(correctionNet),
    grossAmount: decimalToString(grossAmount),
    advanceRecovery: decimalToString(advanceRecovery),
    netAmount: decimalToString(netAmount),
    recoveryPlan: recoveryPlan.map((r) => ({ advanceId: r.advanceId, amount: decimalToString(r.amount) })),
    advancesOutstanding: advancesOutstanding.map((a) => ({
      id: a.id,
      outstanding: decimalToString(a.outstanding),
    })),
    attendanceRowCount: attendanceRows.length,
    philosophy:
      "Montants figés à partir des présences, ajustements datés et récupérations d'avances tracées — jamais un total mutable sans lignes sources.",
  };

  return {
    baseGross,
    overtimePay,
    grossAmount,
    deductions: deduction,
    advanceRecovery,
    correctionNet,
    netAmount,
    recoveryPlan,
    snapshot,
  };
}
