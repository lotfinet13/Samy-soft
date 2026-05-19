import { z } from "zod";

export const materialKindEnum = z.enum(["RAW", "PACKAGING"]);
export const inventoryUnitEnum = z.enum(["KG", "G", "L", "ML", "UNIT"]);
export const inventoryMovementKindEnum = z.enum([
  "PURCHASE_IN",
  "PRODUCTION_OUT",
  "PRODUCTION_IN",
  "MANUAL_ADJUSTMENT",
  "DAMAGED_LOSS",
  "PRODUCTION_WASTE",
  "EXPIRED_LOSS",
  "SALES_OUT",
  "RETURN_IN",
]);

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

export const pagingSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(250).optional().default(40),
});

export const inventorySearchSchema = pagingSchema.extend({
  q: z.string().trim().max(160).optional().default(""),
  includeInactive: z.boolean().optional().default(false),
  category: z.string().trim().max(160).optional().default(""),
  supplierId: z.string().uuid().optional(),
});

export const supplierListSchema = pagingSchema.extend({
  q: z.string().trim().max(160).optional().default(""),
});

export const rawMaterialUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().trim().min(1).max(64),
  labelFr: z.string().trim().min(1).max(255),
  category: z.string().trim().max(120).nullable().optional(),
  unit: inventoryUnitEnum,
  minimumStockQty: nonnegativeDecimalFlexible,
  costPriceUnit: nonnegativeDecimalFlexible,
  expirationTracking: z.boolean().optional().default(false),
  expiryWarningDays: z.coerce.number().int().min(0).max(365 * 12).nullable().optional(),
  notes: z.string().trim().max(2048).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  supplierId: z.string().uuid().nullable().optional(),
});

export const packagingUpsertSchema = rawMaterialUpsertSchema;

export const supplierUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(255),
  contactName: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  email: z
    .union([z.string().trim().email().max(254), z.literal("")])
    .nullable()
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  address: z.string().trim().max(1024).nullable().optional(),
  notes: z.string().trim().max(4096).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

export const purchaseLineInputSchema = z
  .object({
    materialKind: materialKindEnum,
    rawMaterialId: z.string().uuid().optional(),
    packagingMaterialId: z.string().uuid().optional(),
    qty: nonnegativeDecimalFlexible,
    unitPrice: nonnegativeDecimalFlexible,
    expiresAt: z.string().datetime().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.materialKind === "RAW") {
      if (!val.rawMaterialId) {
        ctx.addIssue({ code: "custom", path: ["rawMaterialId"], message: "Matière requise" });
      }
    } else if (!val.packagingMaterialId) {
      ctx.addIssue({
        code: "custom",
        path: ["packagingMaterialId"],
        message: "Article d’emballage requis",
      });
    }
    try {
      const q = Number.parseFloat(String(val.qty));
      const p = Number.parseFloat(String(val.unitPrice));
      if (!(q > 0) || !(p >= 0) || Number.isNaN(q) || Number.isNaN(p)) {
        ctx.addIssue({ code: "custom", path: ["qty"], message: "Quantité > 0 et prix ≥ 0 requis." });
      }
    } catch {
      ctx.addIssue({ code: "custom", message: "Données de ligne incorrectes." });
    }
  });

export const purchaseCreateSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceRef: z.string().trim().max(120).nullable().optional(),
  purchaseDate: z.string().datetime(),
  currencyCode: z.string().trim().length(3).optional().default("DZD"),
  notes: z.string().trim().max(4096).nullable().optional(),
  lines: z.array(purchaseLineInputSchema).min(1),
});

export const outboundMovementSchema = z
  .object({
    inventoryKind: z.enum(["PRODUCTION_OUT", "SALES_OUT", "DAMAGED_LOSS", "EXPIRED_LOSS", "PRODUCTION_WASTE"]),
    materialKind: materialKindEnum,
    rawMaterialId: z.string().uuid().optional(),
    packagingMaterialId: z.string().uuid().optional(),
    qtyOut: nonnegativeDecimalFlexible,
    occurredAt: z.string().datetime().optional(),
    note: z.string().trim().max(2048).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    try {
      const q = Number.parseFloat(String(val.qtyOut));
      if (!(q > 0) || Number.isNaN(q)) {
        ctx.addIssue({ code: "custom", path: ["qtyOut"], message: "Quantité positive requise" });
      }
    } catch {
      ctx.addIssue({ code: "custom", message: "Quantité invalide" });
    }

    if (val.materialKind === "RAW" && !val.rawMaterialId) {
      ctx.addIssue({ code: "custom", path: ["rawMaterialId"], message: "Matière requise" });
    }
    if (val.materialKind === "PACKAGING" && !val.packagingMaterialId) {
      ctx.addIssue({ code: "custom", path: ["packagingMaterialId"], message: "Emballage requis" });
    }
  });

export const inboundMovementSchema = z
  .object({
    inventoryKind: z.enum(["RETURN_IN", "PRODUCTION_IN"]),
    materialKind: materialKindEnum,
    rawMaterialId: z.string().uuid().optional(),
    packagingMaterialId: z.string().uuid().optional(),
    qtyIn: nonnegativeDecimalFlexible,
    occurredAt: z.string().datetime().optional(),
    note: z.string().trim().max(2048).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    try {
      const q = Number.parseFloat(String(val.qtyIn));
      if (!(q > 0) || Number.isNaN(q)) {
        ctx.addIssue({ code: "custom", path: ["qtyIn"], message: "Quantité positive requise" });
      }
    } catch {
      ctx.addIssue({ code: "custom", message: "Quantité invalide" });
    }

    if (val.materialKind === "RAW" && !val.rawMaterialId) {
      ctx.addIssue({ code: "custom", path: ["rawMaterialId"], message: "Matière requise" });
    }
    if (val.materialKind === "PACKAGING" && !val.packagingMaterialId) {
      ctx.addIssue({ code: "custom", path: ["packagingMaterialId"], message: "Emballage requis" });
    }
  });

export const manualAdjustmentSchema = z
  .object({
    materialKind: materialKindEnum,
    rawMaterialId: z.string().uuid().optional(),
    packagingMaterialId: z.string().uuid().optional(),
    targetQty: nonnegativeDecimalFlexible,
    note: z.string().trim().max(2048).nullable().optional(),
    occurredAt: z.string().datetime().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.materialKind === "RAW" && !val.rawMaterialId) {
      ctx.addIssue({ code: "custom", path: ["rawMaterialId"], message: "Matière requise" });
    }
    if (val.materialKind === "PACKAGING" && !val.packagingMaterialId) {
      ctx.addIssue({ code: "custom", path: ["packagingMaterialId"], message: "Emballage requis" });
    }
  });
