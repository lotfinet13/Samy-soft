import { z } from "zod";

export const reportingDateRangeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const reportingPresetSectionSchema = z.enum([
  "inventory",
  "production",
  "payroll",
  "sales",
  "profitability",
  "kpi",
]);

export const reportingPresetUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  section: reportingPresetSectionSchema,
  title: z.string().trim().min(2).max(160),
  /** Objet filtres sérialisable (JSON stringify côté main). */
  filters: z.record(z.string(), z.unknown()).optional().default({}),
});

export const reportingPresetDeleteSchema = z.object({
  id: z.string().uuid(),
});

export const reportingPdfInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
});

export const reportingPdfPayrollSlipSchema = z.object({
  payrollRecordId: z.string().uuid(),
});

export type ReportingPresetSection = z.infer<typeof reportingPresetSectionSchema>;
