import { BarcodeEntityType, type PrismaClient } from "../prisma-client.js";

import type { BarcodeResolution, ThermalPrintJob, TouchTerminalConfig } from "../../shared/pos/types.js";

export type LabelPrintPlan = {
  barcode: string;
  label: string;
  sku?: string | null;
  paperProfile: "LABEL_58MM" | "THERMAL_80MM";
};

export async function resolveBarcode(
  prisma: PrismaClient,
  barcode: string,
): Promise<BarcodeResolution | null> {
  const normalized = barcode.trim();
  if (!normalized) return null;

  const mapping = await prisma.barcodeMapping.findUnique({ where: { barcode: normalized } });
  if (mapping) {
    return {
      barcode: mapping.barcode,
      targetType: mapping.entityType,
      targetId: mapping.entityId,
      sku: mapping.skuSnapshot,
      label: mapping.label,
    };
  }

  const product = await prisma.product.findFirst({
    where: { OR: [{ barcode: normalized }, { sku: normalized }] },
    select: { id: true, sku: true, name: true },
  });
  if (!product) return null;

  return {
    barcode: normalized,
    targetType: BarcodeEntityType.PRODUCT,
    targetId: product.id,
    sku: product.sku,
    label: product.name,
  };
}

export function buildLabelPrintPlan(resolution: BarcodeResolution): LabelPrintPlan {
  return {
    barcode: resolution.barcode,
    label: resolution.label ?? resolution.sku ?? resolution.barcode,
    sku: resolution.sku,
    paperProfile: "LABEL_58MM",
  };
}

export function createThermalPlaceholderJob(plan: LabelPrintPlan): ThermalPrintJob {
  return {
    documentRef: plan.barcode,
    documentType: "label",
    paperProfile: plan.paperProfile,
    payload: JSON.stringify({
      type: "barcode-label",
      barcode: plan.barcode,
      label: plan.label,
      sku: plan.sku ?? null,
    }),
  };
}

export const DEFAULT_TOUCH_TERMINAL_CONFIGS: TouchTerminalConfig[] = [
  { workflow: "pos", minTargetPx: 48, primaryActions: ["scan", "quantity", "validate", "print"] },
  { workflow: "attendance", minTargetPx: 56, primaryActions: ["worker", "status", "save"] },
  { workflow: "production-log", minTargetPx: 56, primaryActions: ["batch", "runtime", "downtime", "save"] },
];
