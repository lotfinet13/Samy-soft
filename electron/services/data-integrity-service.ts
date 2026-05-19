import {
  BatchStatus,
  Decimal,
  InvoicePaymentStatus,
  InvoiceStatus,
  PayrollCycleStatus,
  PayrollStatus,
  type PrismaClient,
} from "../prisma-client.js";
import type { DataIntegrityReport, IntegrityFinding } from "../../shared/data-integrity-types.js";
import { decimalToString, parseDecimal } from "./inventory-service.js";
import { computeLineAmounts } from "./sales-service.js";

export type { DataIntegrityReport, IntegrityFinding } from "../../shared/data-integrity-types.js";

const MAX_SAMPLE = 8;

function push(
  findings: IntegrityFinding[],
  f: Omit<IntegrityFinding, "recommendation"> & { recommendation?: string },
): void {
  findings.push(f);
}

function periodsOverlap(
  a: { periodStart: Date; periodEnd: Date },
  b: { periodStart: Date; periodEnd: Date },
): boolean {
  return !(a.periodEnd.getTime() < b.periodStart.getTime() || b.periodEnd.getTime() < a.periodStart.getTime());
}

/** Contrôles métier en lecture seule — complètent PRAGMA / foreign_key_check. */
export async function runBusinessIntegrityScan(prisma: PrismaClient): Promise<DataIntegrityReport> {
  const findings: IntegrityFinding[] = [];

  const negRaw = await prisma.$queryRawUnsafe<Array<{ id: string; sku: string; stock: unknown }>>(
    `SELECT rm.id, rm.sku, COALESCE(SUM(sm.qtySigned), 0) AS stock
     FROM RawMaterial rm
     LEFT JOIN StockMovement sm ON sm."rawMaterialId" = rm.id AND sm."materialKind" = 'RAW'
     GROUP BY rm.id
     HAVING CAST(stock AS REAL) < -0.000001`,
  );
  if (negRaw.length) {
    push(findings, {
      severity: "critical",
      code: "STOCK_NEGATIVE_RAW",
      operationalWarning: true,
      message: "Stock théorique négatif (matières premières) — grand-livre incohérent ou données corrompues.",
      recommendation:
        "Analyser mouvements sur les SKU concernés ; ajuster avec mouvements d’écriture manuelle tracée ou restaurer depuis sauvegarde vérifiée.",
      count: negRaw.length,
      sampleIds: negRaw.slice(0, MAX_SAMPLE).map((r) => r.id),
    });
  }

  const negPack = await prisma.$queryRawUnsafe<Array<{ id: string; sku: string; stock: unknown }>>(
    `SELECT pm.id, pm.sku, COALESCE(SUM(sm.qtySigned), 0) AS stock
     FROM PackagingMaterial pm
     LEFT JOIN StockMovement sm ON sm."packagingMaterialId" = pm.id AND sm."materialKind" = 'PACKAGING'
     GROUP BY pm.id
     HAVING CAST(stock AS REAL) < -0.000001`,
  );
  if (negPack.length) {
    push(findings, {
      severity: "critical",
      code: "STOCK_NEGATIVE_PACKAGING",
      operationalWarning: true,
      message: "Stock théorique négatif (emballages).",
      recommendation:
        "Vérifier mouvements d’entrée sortie embouteillage et pertes déclarées ; éviter duplication de sorties vente.",
      count: negPack.length,
      sampleIds: negPack.slice(0, MAX_SAMPLE).map((r) => r.id),
    });
  }

  /** États inventaire impossibles côtés mouvements (quantités nulles/absurdes ou signe hors recette métier simple). */
  const impossibleMovements = await prisma.stockMovement.count({
    where: {
      OR: [{ qtySigned: { equals: 0 } }],
    },
  });
  if (impossibleMovements > 0) {
    const rows = await prisma.stockMovement.findMany({
      where: { qtySigned: { equals: 0 } },
      select: { id: true },
      take: MAX_SAMPLE,
    });
    push(findings, {
      severity: "warning",
      code: "STOCK_MOVEMENT_ZERO_QTY",
      message: "Mouvements stock à quantité nulle — bruit comptable ou annulation incomplète.",
      recommendation: "Archiver via script support ou supprimer après validation responsable comptabilité atelier.",
      count: impossibleMovements,
      sampleIds: rows.map((r) => r.id),
    });
  }

  const badMovementShape = await prisma.stockMovement.count({
    where: {
      OR: [
        { materialKind: "RAW", rawMaterialId: null },
        { materialKind: "PACKAGING", packagingMaterialId: null },
        { AND: [{ rawMaterialId: { not: null } }, { packagingMaterialId: { not: null } }] },
      ],
    },
  });
  if (badMovementShape > 0) {
    const rows = await prisma.stockMovement.findMany({
      where: {
        OR: [
          { materialKind: "RAW", rawMaterialId: null },
          { materialKind: "PACKAGING", packagingMaterialId: null },
          { AND: [{ rawMaterialId: { not: null } }, { packagingMaterialId: { not: null } }] },
        ],
      },
      select: { id: true },
      take: MAX_SAMPLE,
    });
    push(findings, {
      severity: "error",
      code: "STOCK_MOVEMENT_MATERIAL_MISMATCH",
      message:
        "Mouvements dont le type matière ne correspond pas à l’article (RAW/PACKAGING ou double référence).",
      recommendation: "Corriger via maintenance contrôlée ou restauration base — ne pas patcher manuellement SQLite hors procédure.",
      count: badMovementShape,
      sampleIds: rows.map((r) => r.id),
    });
  }

  const draftPaid = await prisma.invoice.findMany({
    where: { status: InvoiceStatus.DRAFT, payments: { some: {} } },
    select: { id: true },
    take: MAX_SAMPLE,
  });
  const draftPaidCount = await prisma.invoice.count({
    where: { status: InvoiceStatus.DRAFT, payments: { some: {} } },
  });
  if (draftPaidCount > 0) {
    push(findings, {
      severity: "error",
      code: "INVOICE_DRAFT_WITH_PAYMENTS",
      message: "Factures brouillon avec paiements enregistrés — transition invalide.",
      recommendation: "Annuler paiements orphelins ou valider la facture selon processus vente.",
      count: draftPaidCount,
      sampleIds: draftPaid.map((r) => r.id),
    });
  }

  const cancelledPaid = await prisma.invoice.findMany({
    where: {
      status: InvoiceStatus.CANCELLED,
      paymentStatus: { in: [InvoicePaymentStatus.PARTIAL, InvoicePaymentStatus.PAID] },
    },
    select: { id: true },
    take: MAX_SAMPLE,
  });
  const cancelledPaidCount = await prisma.invoice.count({
    where: {
      status: InvoiceStatus.CANCELLED,
      paymentStatus: { in: [InvoicePaymentStatus.PARTIAL, InvoicePaymentStatus.PAID] },
    },
  });
  if (cancelledPaidCount > 0) {
    push(findings, {
      severity: "warning",
      code: "INVOICE_CANCELLED_WITH_PAYMENT_STATUS",
      operationalWarning: true,
      message: "Facture annulée encore marquée comme payée / partielle — à réconcilier.",
      recommendation: "Mettre à jour statut paiement ou déplacer encaissements vers avoir / note de crédit.",
      count: cancelledPaidCount,
      sampleIds: cancelledPaid.map((r) => r.id),
    });
  }

  const zeroPayments = await prisma.paymentRecord.count({
    where: { amount: { lte: new Decimal(0) } },
  });
  if (zeroPayments > 0) {
    const rows = await prisma.paymentRecord.findMany({
      where: { amount: { lte: new Decimal(0) } },
      select: { id: true },
      take: MAX_SAMPLE,
    });
    push(findings, {
      severity: "error",
      code: "PAYMENT_NON_POSITIVE_AMOUNT",
      message: "Encaissements enregistrés avec montant nul ou négatif — chaîne trésorerie invalide.",
      recommendation: "Supprimer ces lignes de paiement ou corriger le montant depuis module ventes (traçabilité).",
      count: zeroPayments,
      sampleIds: rows.map((r) => r.id),
    });
  }

  const invoicesForPayCheck = await prisma.invoice.findMany({
    where: { status: { in: [InvoiceStatus.VALIDATED, InvoiceStatus.PAID] } },
    select: {
      id: true,
      totalAmount: true,
      paymentStatus: true,
      payments: { select: { amount: true } },
    },
  });

  const paymentMismatchIds = new Set<string>();
  for (const inv of invoicesForPayCheck) {
    const sum = inv.payments.reduce((acc, p) => acc.plus(p.amount), new Decimal(0));
    const total = new Decimal(inv.totalAmount);
    const diff = sum.minus(total).abs();
    if (inv.paymentStatus === InvoicePaymentStatus.PAID && diff.gt(0.01)) {
      paymentMismatchIds.add(inv.id);
    }
    if (inv.paymentStatus === InvoicePaymentStatus.UNPAID && sum.gt(0.01)) {
      paymentMismatchIds.add(inv.id);
    }
    if (inv.paymentStatus === InvoicePaymentStatus.PARTIAL) {
      if (sum.gt(total.plus(0.01))) {
        paymentMismatchIds.add(inv.id);
      }
    }
  }
  if (paymentMismatchIds.size > 0) {
    push(findings, {
      severity: "error",
      code: "INVOICE_PAYMENT_TOTAL_MISMATCH",
      message: "Écart entre total facture et somme des paiements pour des factures actives.",
      recommendation: "Réconcilier écritures trésorerie ou ajuster statut partiel / payé.",
      count: paymentMismatchIds.size,
      sampleIds: [...paymentMismatchIds].slice(0, MAX_SAMPLE),
    });
  }

  /** Lignes facture dont les montants figés ne correspondent plus à la formule métier. */
  const invoiceLines = await prisma.invoiceItem.findMany({
    where: {
      invoice: { status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.VALIDATED, InvoiceStatus.PAID] } },
    },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      lineDiscount: true,
      taxRate: true,
      lineTotal: true,
    },
  });
  const lineMismatchIds: string[] = [];
  for (const it of invoiceLines) {
    try {
      const comp = computeLineAmounts({
        quantity: parseDecimal(decimalToString(it.quantity)),
        unitPrice: parseDecimal(decimalToString(it.unitPrice)),
        lineDiscount: parseDecimal(decimalToString(it.lineDiscount)),
        taxRate: parseDecimal(decimalToString(it.taxRate)),
      });
      const diff = comp.lineTotal.minus(parseDecimal(decimalToString(it.lineTotal))).abs();
      if (diff.gt(0.02)) lineMismatchIds.push(it.id);
    } catch {
      lineMismatchIds.push(it.id);
    }
  }
  if (lineMismatchIds.length > 0) {
    push(findings, {
      severity: "error",
      code: "INVOICE_LINE_TOTAL_STALE",
      message: "Lignes facture avec totaux incohérents par rapport prix / remise / TVA.",
      recommendation: "Ouvrir chaque facture brouillon et enregistrer pour recalculer ; figées → correction contrôlée.",
      count: lineMismatchIds.length,
      sampleIds: lineMismatchIds.slice(0, MAX_SAMPLE),
    });
  }

  /** Articles sans facture parente (protection extra — normalement FK). */
  const orphanInvoiceItems = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`
    SELECT COUNT(*) AS count FROM InvoiceItem ii
    LEFT JOIN Invoice inv ON inv.id = ii.invoiceId
    WHERE inv.id IS NULL
  `);
  const orphanItemCount = Number(orphanInvoiceItems[0]?.count ?? 0);
  if (orphanItemCount > 0) {
    push(findings, {
      severity: "critical",
      code: "INVOICE_ITEM_ORPHAN",
      message: "Lignes de facturation orphelines — intégrité relationnelle rompue.",
      recommendation: "Restauration base ou suppression contrôlée par support — ne pas poursuivre clôtures.",
      count: orphanItemCount,
    });
  }

  const lockedDraftPayroll = await prisma.payrollRecord.findMany({
    where: {
      status: PayrollStatus.DRAFT,
      payrollCycle: { status: PayrollCycleStatus.LOCKED },
    },
    select: { id: true },
    take: MAX_SAMPLE,
  });
  const lockedDraftCount = await prisma.payrollRecord.count({
    where: {
      status: PayrollStatus.DRAFT,
      payrollCycle: { status: PayrollCycleStatus.LOCKED },
    },
  });
  if (lockedDraftCount > 0) {
    push(findings, {
      severity: "warning",
      code: "PAYROLL_LOCKED_CYCLE_DRAFT_RECORD",
      operationalWarning: true,
      message: "Bulletins encore brouillon dans un cycle de paie verrouillé.",
      recommendation: "Rouvrir cycle ou valider bulletin — synchroniser RH / audit social.",
      count: lockedDraftCount,
      sampleIds: lockedDraftPayroll.map((r) => r.id),
    });
  }

  const paidInOpenCycleCount = await prisma.payrollRecord.count({
    where: {
      status: PayrollStatus.PAID,
      payrollCycle: { status: PayrollCycleStatus.DRAFT },
    },
  });
  if (paidInOpenCycleCount > 0) {
    const samples = await prisma.payrollRecord.findMany({
      where: { status: PayrollStatus.PAID, payrollCycle: { status: PayrollCycleStatus.DRAFT } },
      select: { id: true },
      take: MAX_SAMPLE,
    });
    push(findings, {
      severity: "error",
      code: "PAYROLL_PAID_IN_UNLOCKED_CYCLE",
      message: "Bulletins marqués payés dans un cycle non verrouillé — verrou métier inconsistent.",
      recommendation: "Ajuster états cycle / bulletin pour retrouver chronologie cloture versement.",
      count: paidInOpenCycleCount,
      sampleIds: samples.map((r) => r.id),
    });
  }

  /** Cycles fermés avec périodes qui se chevauchent — double paie potentielle. */
  const payrollCyclesClosed = await prisma.payrollCycle.findMany({
    where: { status: { in: [PayrollCycleStatus.LOCKED, PayrollCycleStatus.ARCHIVED] } },
    select: { id: true, label: true, periodStart: true, periodEnd: true },
    orderBy: { periodStart: "asc" },
  });
  const overlapPairs: string[] = [];
  for (let i = 0; i < payrollCyclesClosed.length; i++) {
    for (let j = i + 1; j < payrollCyclesClosed.length; j++) {
      const a = payrollCyclesClosed[i]!;
      const b = payrollCyclesClosed[j]!;
      if (periodsOverlap(a, b)) {
        overlapPairs.push(`${a.id}|${b.id}`);
      }
    }
  }
  if (overlapPairs.length > 0) {
    push(findings, {
      severity: "warning",
      code: "PAYROLL_CYCLE_LOCKED_OVERLAP",
      operationalWarning: true,
      message: "Cycles de paie verrouillés / archivés avec périodes qui se chevauchent.",
      recommendation: "Vérifier bulletin par bulletin et dates de présence pour éviter double liquidation.",
      count: overlapPairs.length,
      sampleIds: overlapPairs.slice(0, MAX_SAMPLE),
    });
  }

  const completedWithoutQty = await prisma.productionBatch.findMany({
    where: {
      status: BatchStatus.COMPLETED,
      OR: [{ producedQty: null }, { producedQty: { lte: new Decimal(0) } }],
    },
    select: { id: true },
    take: MAX_SAMPLE,
  });
  const completedWithoutQtyCount = await prisma.productionBatch.count({
    where: {
      status: BatchStatus.COMPLETED,
      OR: [{ producedQty: null }, { producedQty: { lte: new Decimal(0) } }],
    },
  });
  if (completedWithoutQtyCount > 0) {
    push(findings, {
      severity: "warning",
      code: "PRODUCTION_BATCH_COMPLETED_WITHOUT_QTY",
      operationalWarning: true,
      message: "Lots marqués terminés sans quantité produite valide.",
      recommendation: "Compléter quantité réelle ou rouvrir lot si statut erroné.",
      count: completedWithoutQtyCount,
      sampleIds: completedWithoutQty.map((r) => r.id),
    });
  }

  /** Coûts matières incohérents vs mouvements PRODUCTION_OUT tracés sur le lot. */
  const badCostBatches = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
    SELECT DISTINCT pb.id
    FROM ProductionBatch pb
    JOIN StockMovement sm ON sm."referenceType" = 'ProductionBatch' AND sm."referenceId" = pb.id
    WHERE pb.status = 'COMPLETED'
      AND sm."inventoryKind" = 'PRODUCTION_OUT'
      AND (pb."costIngredientTotal" IS NULL OR CAST(pb."costIngredientTotal" AS REAL) <= 0.000001)
    LIMIT ${MAX_SAMPLE + 50}
  `);
  if (badCostBatches.length > 0) {
    const countRow = await prisma.$queryRawUnsafe<Array<{ c: number }>>(`
      SELECT COUNT(DISTINCT pb.id) AS c
      FROM ProductionBatch pb
      JOIN StockMovement sm ON sm."referenceType" = 'ProductionBatch' AND sm."referenceId" = pb.id
      WHERE pb.status = 'COMPLETED'
        AND sm."inventoryKind" = 'PRODUCTION_OUT'
        AND (pb."costIngredientTotal" IS NULL OR CAST(pb."costIngredientTotal" AS REAL) <= 0.000001)
    `);
    const c = Number(countRow[0]?.c ?? badCostBatches.length);
    push(findings, {
      severity: "warning",
      code: "PRODUCTION_COST_INCONSISTENT_WITH_MOVEMENTS",
      operationalWarning: true,
      message: "Lots complétés avec coûts matières figés à zéro malgré consommations tracées.",
      recommendation:
        "Rouvrir lot pour recalculer coûts (si encore possible) ou document manuel valorisation industrielle.",
      count: c,
      sampleIds: badCostBatches.slice(0, MAX_SAMPLE).map((r) => r.id),
    });
  }

  const [plannedCount, wipCount] = await Promise.all([
    prisma.productionBatch.count({ where: { status: BatchStatus.PLANNED } }),
    prisma.productionBatch.count({ where: { status: BatchStatus.IN_PROGRESS } }),
  ]);
  const totalConcurrent = plannedCount + wipCount;
  if (totalConcurrent > 15) {
    push(findings, {
      severity: "info",
      operationalWarning: true,
      code: "PRODUCTION_MANY_PARALLEL_BATCHES",
      message:
        "Volume élevé de lots planifiés / en cours — risque surcharge suivi consommations et désynchronisation périmètres.",
      recommendation: "Prioriser file production et cloturer anciens rejets avant ouvertures.",
      count: totalConcurrent,
    });
  }

  const checkedAt = new Date().toISOString();

  const hasBlocking =
    findings.filter((f) => f.severity === "critical" || f.severity === "error").length > 0;

  return {
    checkedAt,
    ok: !hasBlocking,
    findings,
  };
}
