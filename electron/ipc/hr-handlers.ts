import { ipcMain } from "electron";
import {
  AdvanceRepaymentStatus,
  AttendanceStatus,
  PayrollCycleStatus,
  PayrollStatus,
} from "../prisma-client.js";

import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import {
  attendanceBulkUpsertSchema,
  attendanceListFiltersSchema,
  attendanceUpsertSchema,
  payrollAdjustmentAddSchema,
  payrollComputeSchema,
  payrollCycleCreateSchema,
  payrollCycleLockSchema,
  salaryAdvanceCreateSchema,
  shiftAssignSchema,
  shiftUpsertSchema,
  workerListFiltersSchema,
  workerUpsertSchema,
} from "../../shared/schemas/hr.js";
import { getPrisma } from "../database.js";
import { logActivity } from "../services/activity-service.js";
import { resolveSessionUser, sessionHasPermission } from "../services/auth-service.js";
import { decimalToString, parseDecimal } from "../services/inventory-service.js";
import { computePayrollCycle, parseWorkedDateInput, todayStoredWorkDate } from "../services/hr-service.js";
import { dateKeyUtc } from "../services/payroll-engine.js";

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

function serializeWorkerLite(row: {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  jobTitle: string | null;
  department: string | null;
  hireDate: Date | null;
  salaryType: string;
  baseSalary: unknown;
  dailyWage: unknown;
  overtimeRate: unknown;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    hireDate: row.hireDate?.toISOString() ?? null,
    baseSalary: row.baseSalary != null ? decimalToString(row.baseSalary) : null,
    dailyWage: row.dailyWage != null ? decimalToString(row.dailyWage) : null,
    overtimeRate: row.overtimeRate != null ? decimalToString(row.overtimeRate) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeAttendance(row: {
  id: string;
  workerId: string;
  workedDate: Date;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  totalWorkedHours: unknown;
  overtimeHours: unknown;
  status: AttendanceStatus;
  shiftId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    workerId: row.workerId,
    workedDate: row.workedDate.toISOString(),
    checkInAt: row.checkInAt?.toISOString() ?? null,
    checkOutAt: row.checkOutAt?.toISOString() ?? null,
    totalWorkedHours: row.totalWorkedHours != null ? decimalToString(row.totalWorkedHours) : null,
    overtimeHours: decimalToString(row.overtimeHours ?? 0),
    status: row.status,
    shiftId: row.shiftId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function registerHrHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.HR_NAV_COUNTS, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_READ);
    const todayStart = todayStoredWorkDate();
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const [workersActive, payrollCyclesDraft, attendanceToday] = await Promise.all([
      prisma.worker.count({ where: { isActive: true } }),
      prisma.payrollCycle.count({ where: { status: PayrollCycleStatus.DRAFT } }),
      prisma.attendanceRecord.count({
        where: { workedDate: { gte: todayStart, lt: todayEnd } },
      }),
    ]);
    return { workersActive, payrollCyclesDraft, attendanceToday };
  });

  ipcMain.handle(IPC_CHANNELS.HR_WORKER_LIST, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_READ);
    const parsed = workerListFiltersSchema.parse(payload ?? {});
    const whereParts: object[] = [];
    if (!parsed.includeInactive) whereParts.push({ isActive: true });
    if (parsed.department?.trim()) whereParts.push({ department: parsed.department.trim() });
    const q = parsed.q?.trim();
    if (q) {
      whereParts.push({
        OR: [
          { code: { contains: q } },
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { phone: { contains: q } },
        ],
      });
    }
    const where = whereParts.length ? { AND: whereParts } : {};
    const skip = parsed.skip ?? 0;
    const take = parsed.take ?? 200;
    const [items, total] = await Promise.all([
      prisma.worker.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip,
        take,
      }),
      prisma.worker.count({ where }),
    ]);
    return { items: items.map(serializeWorkerLite), total };
  });

  ipcMain.handle(IPC_CHANNELS.HR_WORKER_GET, async (_evt, workerId?: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_READ);
    const id = String(workerId ?? "");
    if (!id) throw new Error("Identifiant employé manquant.");
    const row = await prisma.worker.findUnique({
      where: { id },
      include: {
        payrollRecords: { orderBy: { periodEnd: "desc" }, take: 36 },
        attendance: { orderBy: { workedDate: "desc" }, take: 90 },
        shifts: { include: { shift: true } },
      },
    });
    if (!row) throw new Error("Employé introuvable.");
    const logs = await prisma.activityLog.findMany({
      where: { entityType: "worker", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
    return {
      worker: serializeWorkerLite(row),
      payrollRecords: row.payrollRecords.map((p) => ({
        ...p,
        periodStart: p.periodStart.toISOString(),
        periodEnd: p.periodEnd.toISOString(),
        grossAmount: decimalToString(p.grossAmount),
        overtimePay: decimalToString(p.overtimePay),
        deductions: decimalToString(p.deductions),
        advanceRecovery: decimalToString(p.advanceRecovery),
        netAmount: decimalToString(p.netAmount),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      attendance: row.attendance.map(serializeAttendance),
      shifts: row.shifts.map((ws) => ({
        shiftId: ws.shiftId,
        assignedAt: ws.assignedAt.toISOString(),
        shift: {
          ...ws.shift,
          createdAt: ws.shift.createdAt.toISOString(),
          updatedAt: ws.shift.updatedAt.toISOString(),
        },
      })),
      activity: logs.map((l) => ({
        id: l.id,
        action: l.action,
        createdAt: l.createdAt.toISOString(),
        metadata: JSON.parse(l.metadata || "{}") as unknown,
        user: l.user,
      })),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_WORKER_UPSERT, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_WRITE);
    const parsed = workerUpsertSchema.parse(payload);
    const core = {
      code: parsed.code.trim(),
      firstName: parsed.firstName.trim(),
      lastName: parsed.lastName.trim(),
      phone: parsed.phone?.trim() || null,
      address: parsed.address?.trim() || null,
      jobTitle: parsed.jobTitle?.trim() || null,
      department: parsed.department?.trim() || null,
      hireDate: parsed.hireDate ? new Date(parsed.hireDate) : null,
      salaryType: parsed.salaryType,
      notes: parsed.notes?.trim() || null,
      isActive: parsed.isActive ?? true,
    };
    const salaryPatch =
      parsed.baseSalary !== undefined || parsed.dailyWage !== undefined || parsed.overtimeRate !== undefined
        ? {
            ...(parsed.baseSalary !== undefined ? { baseSalary: parseDecimal(parsed.baseSalary) } : {}),
            ...(parsed.dailyWage !== undefined ? { dailyWage: parseDecimal(parsed.dailyWage) } : {}),
            ...(parsed.overtimeRate !== undefined ? { overtimeRate: parseDecimal(parsed.overtimeRate) } : {}),
          }
        : {};
    const finalRow = parsed.id
      ? await prisma.worker.update({
          where: { id: parsed.id },
          data: { ...core, ...salaryPatch },
        })
      : await prisma.worker.create({
          data: {
            ...core,
            baseSalary: parsed.baseSalary !== undefined ? parseDecimal(parsed.baseSalary) : null,
            dailyWage: parsed.dailyWage !== undefined ? parseDecimal(parsed.dailyWage) : null,
            overtimeRate: parsed.overtimeRate !== undefined ? parseDecimal(parsed.overtimeRate) : null,
          },
        });
    await logActivity(prisma, {
      userId: user.id,
      action: parsed.id ? "HR_WORKER_UPDATE" : "HR_WORKER_CREATE",
      entityType: "worker",
      entityId: finalRow.id,
      metadata: { code: finalRow.code },
    });
    return serializeWorkerLite(finalRow);
  });

  ipcMain.handle(IPC_CHANNELS.HR_ATTENDANCE_LIST, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_READ);
    const parsed = attendanceListFiltersSchema.parse(payload);
    const from = parseWorkedDateInput(parsed.from);
    const to = parseWorkedDateInput(parsed.to);
    const whereParts: object[] = [{ workedDate: { gte: from, lte: to } }];
    if (parsed.workerId) whereParts.push({ workerId: parsed.workerId });
    if (parsed.status) whereParts.push({ status: parsed.status });
    const rows = await prisma.attendanceRecord.findMany({
      where: { AND: whereParts },
      orderBy: [{ workedDate: "desc" }, { workerId: "asc" }],
      take: 2000,
      include: { worker: { select: { id: true, code: true, firstName: true, lastName: true } } },
    });
    return {
      items: rows.map((r) => ({
        ...serializeAttendance(r),
        worker: r.worker,
      })),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_ATTENDANCE_UPSERT, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_WRITE);
    const parsed = attendanceUpsertSchema.parse(payload);
    const workedDate = parseWorkedDateInput(parsed.workedDate);
    const data = {
      workerId: parsed.workerId,
      workedDate,
      checkInAt: parsed.checkInAt ? new Date(parsed.checkInAt) : null,
      checkOutAt: parsed.checkOutAt ? new Date(parsed.checkOutAt) : null,
      totalWorkedHours:
        parsed.totalWorkedHours !== undefined ? parseDecimal(parsed.totalWorkedHours) : null,
      overtimeHours:
        parsed.overtimeHours !== undefined ? parseDecimal(parsed.overtimeHours) : parseDecimal("0"),
      status: parsed.status,
      shiftId: parsed.shiftId ?? null,
      notes: parsed.notes?.trim() || null,
      createdById: user.id,
    };
    try {
      const row = parsed.id
        ? await prisma.attendanceRecord.update({
            where: { id: parsed.id },
            data,
          })
        : await prisma.attendanceRecord.create({ data });
      await logActivity(prisma, {
        userId: user.id,
        action: parsed.id ? "HR_ATTENDANCE_UPDATE" : "HR_ATTENDANCE_CREATE",
        entityType: "attendance_record",
        entityId: row.id,
        metadata: { workerId: row.workerId, workedDate: workedDate.toISOString() },
      });
      return serializeAttendance(row);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unique constraint")) {
        throw new Error("Doublon : présence déjà enregistrée pour cet employé et cette date.");
      }
      throw e;
    }
  });

  ipcMain.handle(IPC_CHANNELS.HR_ATTENDANCE_BULK_UPSERT, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_WRITE);
    const parsed = attendanceBulkUpsertSchema.parse(payload);
    const results: ReturnType<typeof serializeAttendance>[] = [];
    for (const item of parsed.items) {
      const workedDate = parseWorkedDateInput(item.workedDate);
      const data = {
        workerId: item.workerId,
        workedDate,
        checkInAt: item.checkInAt ? new Date(item.checkInAt) : null,
        checkOutAt: item.checkOutAt ? new Date(item.checkOutAt) : null,
        totalWorkedHours:
          item.totalWorkedHours !== undefined ? parseDecimal(item.totalWorkedHours) : null,
        overtimeHours:
          item.overtimeHours !== undefined ? parseDecimal(item.overtimeHours) : parseDecimal("0"),
        status: item.status,
        shiftId: item.shiftId ?? null,
        notes: item.notes?.trim() || null,
        createdById: user.id,
      };
      const row = await prisma.attendanceRecord.upsert({
        where: {
          workerId_workedDate: { workerId: item.workerId, workedDate },
        },
        create: data,
        update: {
          checkInAt: data.checkInAt,
          checkOutAt: data.checkOutAt,
          totalWorkedHours: data.totalWorkedHours,
          overtimeHours: data.overtimeHours,
          status: data.status,
          shiftId: data.shiftId,
          notes: data.notes,
        },
      });
      results.push(serializeAttendance(row));
    }
    await logActivity(prisma, {
      userId: user.id,
      action: "HR_ATTENDANCE_BULK",
      entityType: "attendance_record",
      metadata: { count: results.length },
    });
    return { items: results };
  });

  ipcMain.handle(IPC_CHANNELS.HR_ATTENDANCE_DAY_MATRIX, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_READ);
    const raw = (payload ?? {}) as { date?: string };
    const day = raw.date?.trim() ? parseWorkedDateInput(raw.date) : todayStoredWorkDate();
    const workers = await prisma.worker.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
    });
    const records = await prisma.attendanceRecord.findMany({
      where: { workedDate: day },
    });
    const byWorker = new Map(records.map((r) => [r.workerId, r]));
    return {
      date: day.toISOString(),
      workers: workers.map((w) => serializeWorkerLite(w)),
      records: workers.map((w) => {
        const r = byWorker.get(w.id);
        return r ? serializeAttendance(r) : null;
      }),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_SHIFT_LIST, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_READ);
    const shifts = await prisma.shift.findMany({
      orderBy: { name: "asc" },
      include: {
        assignments: { include: { worker: { select: { id: true, code: true, firstName: true, lastName: true } } } },
      },
    });
    return {
      items: shifts.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        assignments: s.assignments.map((a) => ({
          ...a,
          assignedAt: a.assignedAt.toISOString(),
          worker: a.worker,
        })),
      })),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_SHIFT_UPSERT, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_WRITE);
    const parsed = shiftUpsertSchema.parse(payload);
    const data = {
      name: parsed.name.trim(),
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      overtimeRulesJson: parsed.overtimeRulesJson ?? "{}",
      isActive: parsed.isActive ?? true,
    };
    const row = parsed.id
      ? await prisma.shift.update({ where: { id: parsed.id }, data })
      : await prisma.shift.create({ data });
    await logActivity(prisma, {
      userId: user.id,
      action: parsed.id ? "HR_SHIFT_UPDATE" : "HR_SHIFT_CREATE",
      entityType: "shift",
      entityId: row.id,
      metadata: { name: row.name },
    });
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_SHIFT_ASSIGN, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_WRITE);
    const parsed = shiftAssignSchema.parse(payload);
    await prisma.workerShift.deleteMany({ where: { shiftId: parsed.shiftId } });
    if (parsed.workerIds.length > 0) {
      await prisma.workerShift.createMany({
        data: parsed.workerIds.map((workerId) => ({ workerId, shiftId: parsed.shiftId })),
      });
    }
    await logActivity(prisma, {
      userId: user.id,
      action: "HR_SHIFT_ASSIGN",
      entityType: "shift",
      entityId: parsed.shiftId,
      metadata: { count: parsed.workerIds.length },
    });
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.HR_PAYROLL_CYCLE_LIST, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_READ);
    const cycles = await prisma.payrollCycle.findMany({
      orderBy: { periodStart: "desc" },
      take: 48,
      include: {
        _count: { select: { payrollRecords: true } },
      },
    });
    return {
      items: cycles.map((c) => ({
        ...c,
        periodStart: c.periodStart.toISOString(),
        periodEnd: c.periodEnd.toISOString(),
        closedAt: c.closedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        payrollRecordCount: c._count.payrollRecords,
      })),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_PAYROLL_CYCLE_RECORDS, async (_evt, cycleId?: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_READ);
    const id = String(cycleId ?? "");
    if (!id) throw new Error("Cycle paie requis.");
    const rows = await prisma.payrollRecord.findMany({
      where: { payrollCycleId: id },
      include: { worker: true },
      orderBy: { worker: { lastName: "asc" } },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        workerId: r.workerId,
        status: r.status,
        grossAmount: decimalToString(r.grossAmount),
        overtimePay: decimalToString(r.overtimePay),
        deductions: decimalToString(r.deductions),
        advanceRecovery: decimalToString(r.advanceRecovery),
        netAmount: decimalToString(r.netAmount),
        worker: {
          code: r.worker.code,
          lastName: r.worker.lastName,
          firstName: r.worker.firstName,
        },
      })),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_PAYROLL_CYCLE_CREATE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_EXECUTE);
    const parsed = payrollCycleCreateSchema.parse(payload);
    const periodStart = parseWorkedDateInput(parsed.periodStart);
    const periodEnd = parseWorkedDateInput(parsed.periodEnd);
    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new Error("Période paie invalide : fin avant début.");
    }
    const row = await prisma.payrollCycle.create({
      data: {
        label: parsed.label?.trim() || null,
        periodStart,
        periodEnd,
        notes: parsed.notes?.trim() || null,
        status: PayrollCycleStatus.DRAFT,
      },
    });
    await logActivity(prisma, {
      userId: user.id,
      action: "HR_PAYROLL_CYCLE_CREATE",
      entityType: "payroll_cycle",
      entityId: row.id,
      metadata: { label: row.label },
    });
    return {
      ...row,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_PAYROLL_COMPUTE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_EXECUTE);
    const parsed = payrollComputeSchema.parse(payload);
    const result = await computePayrollCycle(prisma, parsed.payrollCycleId);
    await logActivity(prisma, {
      userId: user.id,
      action: "HR_PAYROLL_COMPUTE",
      entityType: "payroll_cycle",
      entityId: parsed.payrollCycleId,
      metadata: result,
    });
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.HR_PAYROLL_RECORD_GET, async (_evt, payrollRecordId?: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_READ);
    const id = String(payrollRecordId ?? "");
    if (!id) throw new Error("Identifiant fiche paie manquant.");
    const row = await prisma.payrollRecord.findUnique({
      where: { id },
      include: {
        worker: true,
        adjustments: { orderBy: { createdAt: "desc" } },
        advanceRecoveries: { include: { salaryAdvance: true } },
      },
    });
    if (!row) throw new Error("Fiche paie introuvable.");
    return {
      ...row,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      grossAmount: decimalToString(row.grossAmount),
      overtimePay: decimalToString(row.overtimePay),
      deductions: decimalToString(row.deductions),
      advanceRecovery: decimalToString(row.advanceRecovery),
      netAmount: decimalToString(row.netAmount),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      worker: serializeWorkerLite(row.worker),
      adjustments: row.adjustments.map((a) => ({
        ...a,
        amount: decimalToString(a.amount),
        createdAt: a.createdAt.toISOString(),
      })),
      advanceRecoveries: row.advanceRecoveries.map((r) => ({
        ...r,
        amount: decimalToString(r.amount),
        createdAt: r.createdAt.toISOString(),
        salaryAdvance: {
          ...r.salaryAdvance,
          amount: decimalToString(r.salaryAdvance.amount),
          paymentDate: r.salaryAdvance.paymentDate.toISOString(),
          createdAt: r.salaryAdvance.createdAt.toISOString(),
          updatedAt: r.salaryAdvance.updatedAt.toISOString(),
        },
      })),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_PAYROLL_ADJUSTMENT_ADD, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_ADJUST);
    const parsed = payrollAdjustmentAddSchema.parse(payload);
    const rec = await prisma.payrollRecord.findUnique({
      where: { id: parsed.payrollRecordId },
      include: { payrollCycle: true },
    });
    if (!rec?.payrollCycle) throw new Error("Fiche paie invalide.");
    if (rec.payrollCycle.status !== PayrollCycleStatus.DRAFT) {
      throw new Error("Cycle verrouillé — ajustement interdit.");
    }
    const row = await prisma.payrollAdjustment.create({
      data: {
        payrollRecordId: parsed.payrollRecordId,
        kind: parsed.kind,
        amount: parseDecimal(parsed.amount),
        reason: parsed.reason?.trim() || null,
        createdById: user.id,
      },
    });
    await computePayrollCycle(prisma, rec.payrollCycle.id);
    await logActivity(prisma, {
      userId: user.id,
      action: "HR_PAYROLL_ADJUSTMENT",
      entityType: "payroll_adjustment",
      entityId: row.id,
      metadata: { payrollRecordId: parsed.payrollRecordId, kind: parsed.kind },
    });
    return {
      ...row,
      amount: decimalToString(row.amount),
      createdAt: row.createdAt.toISOString(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_PAYROLL_CYCLE_LOCK, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_EXECUTE);
    const parsed = payrollCycleLockSchema.parse(payload);
    await prisma.$transaction(async (tx) => {
      const cycle = await tx.payrollCycle.findUnique({ where: { id: parsed.payrollCycleId } });
      if (!cycle) throw new Error("Cycle introuvable.");
      if (cycle.status !== PayrollCycleStatus.DRAFT) throw new Error("Cycle déjà verrouillé.");
      await tx.payrollRecord.updateMany({
        where: { payrollCycleId: parsed.payrollCycleId },
        data: { status: PayrollStatus.VALIDATED },
      });
      await tx.payrollCycle.update({
        where: { id: parsed.payrollCycleId },
        data: {
          status: PayrollCycleStatus.LOCKED,
          closedAt: new Date(),
          closedById: user.id,
        },
      });
    });
    await logActivity(prisma, {
      userId: user.id,
      action: "HR_PAYROLL_CYCLE_LOCK",
      entityType: "payroll_cycle",
      entityId: parsed.payrollCycleId,
      metadata: {},
    });
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.HR_ADVANCE_LIST, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_READ);
    const raw = (payload ?? {}) as { workerId?: string };
    const rows = await prisma.salaryAdvance.findMany({
      where: raw.workerId ? { workerId: raw.workerId } : undefined,
      orderBy: { paymentDate: "desc" },
      take: 500,
      include: { worker: { select: { id: true, code: true, firstName: true, lastName: true } } },
    });
    return {
      items: rows.map((r) => ({
        ...r,
        amount: decimalToString(r.amount),
        paymentDate: r.paymentDate.toISOString(),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        worker: r.worker,
      })),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_ADVANCE_CREATE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_EXECUTE);
    const parsed = salaryAdvanceCreateSchema.parse(payload);
    const row = await prisma.salaryAdvance.create({
      data: {
        workerId: parsed.workerId,
        amount: parseDecimal(parsed.amount),
        reason: parsed.reason?.trim() || null,
        paymentDate: parseWorkedDateInput(parsed.paymentDate),
        notes: parsed.notes?.trim() || null,
        repaymentStatus: AdvanceRepaymentStatus.PENDING,
        createdById: user.id,
      },
    });
    await logActivity(prisma, {
      userId: user.id,
      action: "HR_ADVANCE_CREATE",
      entityType: "salary_advance",
      entityId: row.id,
      metadata: { workerId: row.workerId, amount: decimalToString(row.amount) },
    });
    return {
      ...row,
      amount: decimalToString(row.amount),
      paymentDate: row.paymentDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_DASHBOARD_SUMMARY, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.HR_READ);
    const todayStart = todayStoredWorkDate();
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const workers = await prisma.worker.findMany({ where: { isActive: true }, select: { id: true } });

    const todayRecords = await prisma.attendanceRecord.findMany({
      where: { workedDate: { gte: todayStart, lt: todayEnd } },
      include: { worker: { select: { id: true, code: true, firstName: true, lastName: true } } },
    });

    const presentLike = new Set<AttendanceStatus>([
      AttendanceStatus.PRESENT,
      AttendanceStatus.LATE,
      AttendanceStatus.HALF_DAY,
      AttendanceStatus.OVERTIME,
    ]);

    const presentIds = new Set(todayRecords.filter((r) => presentLike.has(r.status)).map((r) => r.workerId));

    const absentWorkers = workers
      .filter((w) => !presentIds.has(w.id))
      .slice(0, 40);

    const absentDetails = await prisma.worker.findMany({
      where: { id: { in: absentWorkers.map((w) => w.id) } },
      select: { id: true, code: true, firstName: true, lastName: true },
      orderBy: { code: "asc" },
    });

    const overtimeAlerts = todayRecords
      .filter((r) => parseDecimal(decimalToString(r.overtimeHours)).gt(0))
      .map((r) => ({
        worker: r.worker,
        overtimeHours: decimalToString(r.overtimeHours),
        status: r.status,
      }));

    const draftCycles = await prisma.payrollCycle.findMany({
      where: { status: PayrollCycleStatus.DRAFT },
      orderBy: { periodEnd: "asc" },
      take: 6,
    });

    let payrollTotals = {
      gross: "0",
      net: "0",
      advances: "0",
      count: 0,
    };
    if (draftCycles[0]) {
      const agg = await prisma.payrollRecord.aggregate({
        where: { payrollCycleId: draftCycles[0].id },
        _sum: { grossAmount: true, netAmount: true, advanceRecovery: true },
        _count: true,
      });
      payrollTotals = {
        gross: decimalToString(agg._sum.grossAmount ?? 0),
        net: decimalToString(agg._sum.netAmount ?? 0),
        advances: decimalToString(agg._sum.advanceRecovery ?? 0),
        count: agg._count,
      };
    }

    const recentWorkers = await prisma.activityLog.findMany({
      where: { entityType: "worker" },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { user: { select: { displayName: true, username: true } } },
    });

    return {
      today: {
        date: todayStart.toISOString(),
        punchCount: todayRecords.length,
        presentApprox: presentIds.size,
      },
      absentWorkers: absentDetails,
      overtimeAlerts,
      payrollDraftCycles: draftCycles.map((c) => ({
        id: c.id,
        label: c.label,
        periodStart: c.periodStart.toISOString(),
        periodEnd: c.periodEnd.toISOString(),
      })),
      payrollTotalsDraft: payrollTotals,
      recentWorkerActivity: recentWorkers.map((l) => ({
        id: l.id,
        action: l.action,
        entityId: l.entityId,
        createdAt: l.createdAt.toISOString(),
        user: l.user,
      })),
    };
  });

  ipcMain.handle(IPC_CHANNELS.HR_REPORT_PAYROLL_CSV, async (_evt, payrollCycleId?: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_REPORT);
    const id = String(payrollCycleId ?? "");
    if (!id) throw new Error("Cycle paie requis.");
    const cycle = await prisma.payrollCycle.findUnique({ where: { id } });
    if (!cycle) throw new Error("Cycle introuvable.");
    const rows = await prisma.payrollRecord.findMany({
      where: { payrollCycleId: id },
      include: { worker: true },
      orderBy: { worker: { lastName: "asc" } },
    });
    const headers = [
      "Code",
      "Nom",
      "Prénom",
      "Brut",
      "Heures sup pay",
      "Retenues",
      "Récup avances",
      "Net",
      "Statut",
    ];
    const data = rows.map((r) => [
      r.worker.code,
      r.worker.lastName,
      r.worker.firstName,
      decimalToString(r.grossAmount),
      decimalToString(r.overtimePay),
      decimalToString(r.deductions),
      decimalToString(r.advanceRecovery),
      decimalToString(r.netAmount),
      r.status,
    ]);
    return { csv: csvFromRows(headers, data) };
  });

  ipcMain.handle(IPC_CHANNELS.HR_REPORT_ATTENDANCE_CSV, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_REPORT);
    const parsed = attendanceListFiltersSchema.parse(payload);
    const from = parseWorkedDateInput(parsed.from);
    const to = parseWorkedDateInput(parsed.to);
    const rows = await prisma.attendanceRecord.findMany({
      where: { workedDate: { gte: from, lte: to } },
      orderBy: [{ workedDate: "asc" }, { workerId: "asc" }],
      take: 8000,
      include: { worker: true },
    });
    const headers = ["Date", "Code", "Nom", "Statut", "Entrée", "Sortie", "Durée", "HS", "Notes"];
    const data = rows.map((r) => [
      dateKeyUtc(r.workedDate),
      r.worker.code,
      `${r.worker.lastName} ${r.worker.firstName}`,
      r.status,
      r.checkInAt?.toISOString() ?? "",
      r.checkOutAt?.toISOString() ?? "",
      r.totalWorkedHours != null ? decimalToString(r.totalWorkedHours) : "",
      decimalToString(r.overtimeHours ?? 0),
      r.notes ?? "",
    ]);
    return { csv: csvFromRows(headers, data) };
  });

  ipcMain.handle(IPC_CHANNELS.HR_REPORT_ADVANCES_CSV, async () => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_REPORT);
    const rows = await prisma.salaryAdvance.findMany({
      orderBy: { paymentDate: "desc" },
      take: 4000,
      include: { worker: true },
    });
    const headers = ["Date paiement", "Code", "Employé", "Montant", "Statut remb.", "Motif"];
    const data = rows.map((r) => [
      r.paymentDate.toISOString().slice(0, 10),
      r.worker.code,
      `${r.worker.lastName} ${r.worker.firstName}`,
      decimalToString(r.amount),
      r.repaymentStatus,
      r.reason ?? "",
    ]);
    return { csv: csvFromRows(headers, data) };
  });

  ipcMain.handle(IPC_CHANNELS.HR_REPORT_OVERTIME_CSV, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireAuthUser();
    enforcePermission(user, PERMISSIONS.PAYROLL_REPORT);
    const parsed = attendanceListFiltersSchema.parse(payload);
    const from = parseWorkedDateInput(parsed.from);
    const to = parseWorkedDateInput(parsed.to);
    const rows = await prisma.attendanceRecord.findMany({
      where: {
        workedDate: { gte: from, lte: to },
        overtimeHours: { gt: 0 },
      },
      orderBy: [{ workedDate: "desc" }],
      take: 8000,
      include: { worker: true },
    });
    const headers = ["Date", "Code", "Employé", "Heures sup", "Statut"];
    const data = rows.map((r) => [
      dateKeyUtc(r.workedDate),
      r.worker.code,
      `${r.worker.lastName} ${r.worker.firstName}`,
      decimalToString(r.overtimeHours ?? 0),
      r.status,
    ]);
    return { csv: csvFromRows(headers, data) };
  });
}
