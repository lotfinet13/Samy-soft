import type { Prisma, PrismaClient } from "../prisma-client.js";

export type DbContext = PrismaClient | Prisma.TransactionClient;

export type RepositoryRuntimeMode = "single-user-sqlite" | "future-lan-server";

export type RepositoryExecutionContext = {
  db: DbContext;
  mode: RepositoryRuntimeMode;
  actorId?: string | null;
  workstationId?: string | null;
};

export type OptimisticGuard = {
  entityType: string;
  entityId: string;
  expectedVersion?: number;
};

export type PessimisticLockTarget = {
  entityType: string;
  entityId: string;
  reason: string;
};

export function singleUserRepositoryContext(
  db: DbContext,
  actorId?: string | null,
): RepositoryExecutionContext {
  return {
    db,
    mode: "single-user-sqlite",
    actorId: actorId ?? null,
  };
}

export function describeConflictGuard(guard: OptimisticGuard): string {
  const version = guard.expectedVersion == null ? "latest" : String(guard.expectedVersion);
  return `${guard.entityType}:${guard.entityId}@${version}`;
}
