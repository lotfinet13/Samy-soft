import { z } from "zod";

import { inventoryUnitEnum, pagingSchema } from "./inventory.js";

export const batchStatusEnum = z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

export const productionRecipeUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(64),
  labelFr: z.string().trim().min(1).max(255),
  category: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(4096).nullable().optional(),
  productionNotes: z.string().trim().max(8192).nullable().optional(),
  yieldQty: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((value) => {
      const qty = Number.parseFloat(value);
      return !Number.isNaN(qty) && qty > 0;
    }, "yieldQty doit être > 0"),
  yieldUnit: inventoryUnitEnum,
  estimatedMinutes: z.coerce.number().int().min(0).max(24 * 120).nullable().optional(),
  isActive: z.boolean().optional(),
  recipeVersion: z.coerce.number().int().min(1).max(999).optional(),
  parentRecipeId: z.string().uuid().nullable().optional(),
  outputPackagingMaterialId: z.string().uuid().nullable().optional(),
});

export const productionRecipeIngredientLineSchema = z.object({
  rawMaterialId: z.string().uuid(),
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((value) => {
      const qty = Number.parseFloat(value);
      return !Number.isNaN(qty) && qty > 0;
    }),
  unit: inventoryUnitEnum,
  optionalIngredient: z.boolean().optional().default(false),
  wastePct: z.coerce.number().min(0).max(400).nullable().optional().default(0),
  sortOrder: z.number().int().min(0).max(4096).optional(),
  note: z.string().trim().max(1024).nullable().optional(),
});

export const productionRecipeIngredientsReplaceSchema = z.object({
  recipeId: z.string().uuid(),
  lines: z.array(productionRecipeIngredientLineSchema),
});

export const productionRecipeDuplicateSchema = z.object({
  recipeId: z.string().uuid(),
  newCode: z.string().trim().max(80).nullable().optional(),
});

export const productionRecipeSearchSchema = pagingSchema.extend({
  q: z.string().trim().max(160).optional().default(""),
  category: z.string().trim().max(160).optional().default(""),
  includeInactive: z.boolean().optional().default(false),
});

export const productionBatchCreateSchema = z.object({
  recipeId: z.string().uuid(),
  plannedQty: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((value) => {
      const qty = Number.parseFloat(value);
      return !Number.isNaN(qty) && qty > 0;
    }),
  scheduledAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(8192).nullable().optional(),
  operatorId: z.string().uuid().nullable().optional(),
});

export const productionBatchLifecycleSchema = z.object({
  batchId: z.string().uuid(),
});

export const productionBatchCompleteSchema = z.object({
  batchId: z.string().uuid(),
  producedQty: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((value) => {
      const qty = Number.parseFloat(value);
      return !Number.isNaN(qty) && qty > 0;
    }),
  occurredAt: z.string().datetime().optional(),
  laborCostEstimate: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((value) => {
      const amt = Number.parseFloat(value);
      return !Number.isNaN(amt) && amt >= 0;
    })
    .optional(),
  overheadCostEstimate: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((value) => {
      const amt = Number.parseFloat(value);
      return !Number.isNaN(amt) && amt >= 0;
    })
    .optional(),
});

export const productionShortagePreviewSchema = z.object({
  recipeId: z.string().uuid(),
  targetQty: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((value) => {
      const qty = Number.parseFloat(value);
      return !Number.isNaN(qty) && qty > 0;
    }),
});

export const productionWasteRegisterSchema = z.object({
  batchId: z.string().uuid().nullable().optional(),
  rawMaterialId: z.string().uuid(),
  qtyLost: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((value) => {
      const qty = Number.parseFloat(value);
      return !Number.isNaN(qty) && qty > 0;
    }),
  note: z.string().trim().max(2048).nullable().optional(),
  inventoryKind: z.enum(["PRODUCTION_WASTE", "DAMAGED_LOSS"]).optional().default("PRODUCTION_WASTE"),
});

export const productionOperationLogCreateSchema = z.object({
  batchId: z.string().uuid().nullable().optional(),
  mixerCode: z.string().trim().max(120).nullable().optional(),
  runtimeMinutes: z.coerce.number().int().min(0).max(24 * 120).nullable().optional(),
  cleaningDone: z.boolean().optional().default(false),
  cleaningNotes: z.string().trim().max(2048).nullable().optional(),
  maintenanceNeeded: z.boolean().optional().default(false),
  maintenanceNotes: z.string().trim().max(4096).nullable().optional(),
  notes: z.string().trim().max(4096).nullable().optional(),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().nullable().optional(),
});

export const productionBatchListSchema = pagingSchema.extend({
  status: batchStatusEnum.optional(),
  recipeId: z.string().uuid().optional(),
  q: z.string().trim().max(160).optional().default(""),
});

export const mixerLogListSchema = pagingSchema.extend({
  mixerCode: z.string().trim().max(160).optional().default(""),
  batchId: z.string().uuid().optional(),
});

export type ProductionRecipeIngredientsReplace = z.infer<typeof productionRecipeIngredientsReplaceSchema>;
export type ProductionBatchComplete = z.infer<typeof productionBatchCompleteSchema>;
