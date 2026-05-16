import { z } from "zod";

export const salaryTypeSchema = z.enum(["MONTHLY", "DAILY"]);

export const attendanceStatusSchema = z.enum([
  "PRESENT",
  "ABSENT",
  "LATE",
  "HALF_DAY",
  "OVERTIME",
  "SICK_LEAVE",
  "VACATION",
]);

export const advanceRepaymentStatusSchema = z.enum(["PENDING", "PARTIAL", "REPAID", "WRITTEN_OFF"]);

export const payrollAdjustmentKindSchema = z.enum(["BONUS", "DEDUCTION", "CORRECTION"]);

export const payrollCycleStatusSchema = z.enum(["DRAFT", "LOCKED", "ARCHIVED"]);

export const payrollStatusSchema = z.enum(["DRAFT", "VALIDATED", "PAID"]);

const decimalString = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "Montant décimal invalide.")
  .refine((s) => Number.isFinite(Number(s)), "Nombre hors limites.");

const optionalDecimalString = z
  .union([z.literal(""), decimalString])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

export const workerUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1, "Code obligatoire.").max(64),
  firstName: z.string().min(1).max(128),
  lastName: z.string().min(1).max(128),
  phone: z.string().max(64).optional().nullable(),
  address: z.string().max(512).optional().nullable(),
  jobTitle: z.string().max(128).optional().nullable(),
  department: z.string().max(128).optional().nullable(),
  hireDate: z.string().datetime().optional().nullable(),
  salaryType: salaryTypeSchema,
  baseSalary: optionalDecimalString,
  dailyWage: optionalDecimalString,
  overtimeRate: optionalDecimalString,
  notes: z.string().max(4000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const workerListFiltersSchema = z.object({
  q: z.string().optional(),
  department: z.string().optional(),
  includeInactive: z.boolean().optional(),
  skip: z.number().int().min(0).optional(),
  take: z.number().int().min(1).max(500).optional(),
});

export const attendanceUpsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    workerId: z.string().uuid(),
    workedDate: z.string().min(1),
    checkInAt: z.string().datetime().optional().nullable(),
    checkOutAt: z.string().datetime().optional().nullable(),
    totalWorkedHours: optionalDecimalString,
    overtimeHours: optionalDecimalString,
    status: attendanceStatusSchema,
    shiftId: z.string().uuid().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.checkInAt && data.checkOutAt) {
      const a = new Date(data.checkInAt).getTime();
      const b = new Date(data.checkOutAt).getTime();
      if (b < a) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pointage incohérent : sortie avant entrée.",
          path: ["checkOutAt"],
        });
      }
    }
    const ot = data.overtimeHours !== undefined ? Number(data.overtimeHours) : 0;
    if (Number.isFinite(ot) && ot < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Les heures supplémentaires ne peuvent pas être négatives.",
        path: ["overtimeHours"],
      });
    }
    const tw = data.totalWorkedHours !== undefined ? Number(data.totalWorkedHours) : undefined;
    if (tw !== undefined && Number.isFinite(tw) && tw < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Durée travaillée invalide.",
        path: ["totalWorkedHours"],
      });
    }
  });

export const attendanceBulkUpsertSchema = z.object({
  items: z.array(attendanceUpsertSchema).min(1).max(500),
});

export const attendanceListFiltersSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  workerId: z.string().uuid().optional(),
  status: attendanceStatusSchema.optional(),
});

export const shiftUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(128),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:mm requis."),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:mm requis."),
  overtimeRulesJson: z.string().max(16000).optional(),
  isActive: z.boolean().optional(),
});

export const shiftAssignSchema = z.object({
  shiftId: z.string().uuid(),
  workerIds: z.array(z.string().uuid()).max(500),
});

export const payrollCycleCreateSchema = z.object({
  label: z.string().max(256).optional().nullable(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  notes: z.string().max(4000).optional().nullable(),
});

export const payrollComputeSchema = z.object({
  payrollCycleId: z.string().uuid(),
});

export const payrollAdjustmentAddSchema = z
  .object({
    payrollRecordId: z.string().uuid(),
    kind: payrollAdjustmentKindSchema,
    amount: decimalString,
    reason: z.string().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const n = Number(data.amount);
    if (data.kind !== "CORRECTION" && n < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Montant doit être positif pour prime ou retenue.",
        path: ["amount"],
      });
    }
    if ((data.kind === "BONUS" || data.kind === "DEDUCTION") && n === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Montant nul interdit.",
        path: ["amount"],
      });
    }
  });

export const payrollCycleLockSchema = z.object({
  payrollCycleId: z.string().uuid(),
});

export const salaryAdvanceCreateSchema = z.object({
  workerId: z.string().uuid(),
  amount: decimalString.refine((s) => Number(s) > 0, "Montant doit être > 0."),
  reason: z.string().max(2000).optional().nullable(),
  paymentDate: z.string().min(1),
  notes: z.string().max(4000).optional().nullable(),
});

export const payrollTotalsSchema = z.object({
  grossAmount: decimalString,
  deductions: decimalString,
  overtimePay: decimalString,
  advanceRecovery: decimalString,
  netAmount: decimalString,
});

export type WorkerUpsertInput = z.infer<typeof workerUpsertSchema>;
export type AttendanceUpsertInput = z.infer<typeof attendanceUpsertSchema>;
