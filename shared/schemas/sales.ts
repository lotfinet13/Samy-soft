import { z } from "zod";

export const invoiceStatusEnum = z.enum(["DRAFT", "VALIDATED", "PAID", "CANCELLED"]);
export const invoicePaymentStatusEnum = z.enum(["UNPAID", "PARTIAL", "PAID"]);
export const paymentMethodEnum = z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"]);

const nonnegativeDecimalFlexible = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => {
    try {
      const n = Number.parseFloat(v);
      return !Number.isNaN(n) && n >= 0;
    } catch {
      return false;
    }
  }, "Nombre ≥ 0 requis");

const positiveDecimalFlexible = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => {
    try {
      const n = Number.parseFloat(v);
      return !Number.isNaN(n) && n > 0;
    } catch {
      return false;
    }
  }, "Nombre > 0 requis");

export const salesPagingSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(250).optional().default(40),
});

export const customerListFiltersSchema = salesPagingSchema.extend({
  q: z.string().trim().max(160).optional().default(""),
  includeInactive: z.boolean().optional().default(false),
  city: z.string().trim().max(120).optional().default(""),
});

export const customerUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  phone: z.string().trim().max(64).nullable().optional(),
  email: z
    .union([z.string().trim().email().max(254), z.literal("")])
    .nullable()
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  address: z.string().trim().max(1024).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  taxIdentifier: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(4096).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

export const productUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  category: z.string().trim().max(120).nullable().optional(),
  sellingPrice: nonnegativeDecimalFlexible,
  unit: z.enum(["KG", "G", "L", "ML", "UNIT"]),
  recipeId: z
    .union([z.string().uuid(), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v)),
  packagingMaterialId: z
    .union([z.string().uuid(), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v)),
  barcode: z.string().trim().max(128).nullable().optional(),
  notes: z.string().trim().max(4096).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

export const productListFiltersSchema = salesPagingSchema.extend({
  q: z.string().trim().max(160).optional().default(""),
  includeInactive: z.boolean().optional().default(false),
  category: z.string().trim().max(120).optional().default(""),
});

export const invoiceLineInputSchema = z.object({
  productId: z
    .union([z.string().uuid(), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v)),
  labelFr: z.string().trim().min(1).max(255),
  quantity: positiveDecimalFlexible,
  unitPrice: nonnegativeDecimalFlexible,
  lineDiscount: nonnegativeDecimalFlexible.optional().default("0"),
  taxRate: nonnegativeDecimalFlexible.optional().default("0"),
  notes: z.string().trim().max(2048).nullable().optional(),
});

export const invoiceDraftUpsertSchema = z.object({
  customerId: z.string().uuid(),
  issuedAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  paymentMethod: paymentMethodEnum.nullable().optional(),
  currencyCode: z.string().trim().min(1).max(8).optional().default("DZD"),
  discountAmount: nonnegativeDecimalFlexible.optional().default("0"),
  notes: z.string().trim().max(4096).nullable().optional(),
});

export const invoiceLinesReplaceSchema = z.object({
  invoiceId: z.string().uuid(),
  lines: z.array(invoiceLineInputSchema).min(1).max(200),
});

export const invoiceCreateDraftSchema = invoiceDraftUpsertSchema.extend({
  lines: z.array(invoiceLineInputSchema).min(1).max(200),
});

export const invoiceUpdateDraftSchema = z.object({
  invoiceId: z.string().uuid(),
  patch: invoiceDraftUpsertSchema.partial(),
});

export const invoiceIdSchema = z.object({
  invoiceId: z.string().uuid(),
});

export const invoiceValidateSchema = invoiceIdSchema;

export const invoiceCancelSchema = invoiceIdSchema;

export const paymentRegisterSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: positiveDecimalFlexible,
  method: paymentMethodEnum,
  paidAt: z.string().datetime().optional(),
  reference: z.string().trim().max(128).nullable().optional(),
  notes: z.string().trim().max(2048).nullable().optional(),
});

export const invoiceListFiltersSchema = salesPagingSchema.extend({
  q: z.string().trim().max(160).optional().default(""),
  status: invoiceStatusEnum.optional(),
  paymentStatus: invoicePaymentStatusEnum.optional(),
  customerId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const salesReportRangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});
