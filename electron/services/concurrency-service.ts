import { LockScope, type PrismaClient } from "../prisma-client.js";

import type { OptimisticGuard, PessimisticLockTarget } from "../repositories/db-context.js";

export type CriticalWorkflow =
  | "invoice-validation"
  | "stock-movement"
  | "payroll-lock"
  | "production-batch"
  | "attendance-entry";

export type WorkflowConcurrencyPolicy = {
  workflow: CriticalWorkflow;
  optimisticEntities: string[];
  pessimisticEntities: string[];
  conflictResolution: string;
};

export const WORKFLOW_CONCURRENCY_POLICIES: WorkflowConcurrencyPolicy[] = [
  {
    workflow: "invoice-validation",
    optimisticEntities: ["Invoice", "InvoiceItem", "Product"],
    pessimisticEntities: ["StockMovement:PACKAGING"],
    conflictResolution: "Recharger la facture, recalculer les lignes, puis rejouer la validation si le stock est encore disponible.",
  },
  {
    workflow: "stock-movement",
    optimisticEntities: ["RawMaterial", "PackagingMaterial"],
    pessimisticEntities: ["StockMovement"],
    conflictResolution: "Le grand-livre reste source de vérité ; un conflit demande une nouvelle lecture du solde avant posting.",
  },
  {
    workflow: "payroll-lock",
    optimisticEntities: ["PayrollCycle", "PayrollRecord"],
    pessimisticEntities: ["PayrollCycle"],
    conflictResolution: "Un cycle verrouillé gagne ; les recalculs tardifs sont rejetés et doivent ouvrir un ajustement.",
  },
  {
    workflow: "production-batch",
    optimisticEntities: ["ProductionBatch", "Recipe"],
    pessimisticEntities: ["ProductionBatch", "StockMovement:RAW"],
    conflictResolution: "Le lot est relu avant clôture ; les consommations sont postées une seule fois dans la transaction.",
  },
  {
    workflow: "attendance-entry",
    optimisticEntities: ["AttendanceRecord"],
    pessimisticEntities: ["AttendanceRecord:worker-day"],
    conflictResolution: "La clé unique salarié/jour tranche ; l'opérateur recharge la journée et corrige l'entrée.",
  },
];

export async function bumpOperationalVersion(
  prisma: PrismaClient,
  guard: OptimisticGuard,
  actorId?: string | null,
): Promise<number> {
  const row = await prisma.operationalVersion.upsert({
    where: { entityType_entityId: { entityType: guard.entityType, entityId: guard.entityId } },
    create: {
      entityType: guard.entityType,
      entityId: guard.entityId,
      version: 1,
      updatedById: actorId ?? null,
    },
    update: {
      version: { increment: 1 },
      updatedById: actorId ?? null,
    },
    select: { version: true },
  });
  return row.version;
}

export async function assertOptimisticVersion(
  prisma: PrismaClient,
  guard: OptimisticGuard,
): Promise<void> {
  if (guard.expectedVersion == null) return;
  const row = await prisma.operationalVersion.findUnique({
    where: { entityType_entityId: { entityType: guard.entityType, entityId: guard.entityId } },
    select: { version: true },
  });
  if ((row?.version ?? 1) !== guard.expectedVersion) {
    throw new Error("Conflit de modification : recharger les donnees avant de continuer.");
  }
}

export async function registerFutureLockIntent(
  prisma: PrismaClient,
  target: PessimisticLockTarget,
  ownerUserId?: string | null,
): Promise<string> {
  const lock = await prisma.operationalLock.create({
    data: {
      entityType: target.entityType,
      entityId: target.entityId,
      scope: LockScope.PESSIMISTIC,
      ownerUserId: ownerUserId ?? null,
      reason: target.reason,
      metadata: JSON.stringify({ advisoryOnly: true }),
    },
    select: { id: true },
  });
  return lock.id;
}
