import type { Prisma, PrismaClient } from "../prisma-client.js";

type ActivityWriter = PrismaClient | Prisma.TransactionClient;

export async function logActivity(
  prisma: ActivityWriter,
  params: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  let userId: string | null | undefined = params.userId ?? null;
  if (userId) {
    const exists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) {
      throw new Error(
        `ActivityLog: userId inexistant (${userId}) — action=${params.action}. Utiliser userId null et metadata pour les sessions orphelines.`,
      );
    }
  } else {
    userId = undefined;
  }

  await prisma.activityLog.create({
    data: {
      userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? undefined,
      metadata: JSON.stringify(params.metadata ?? {}),
    },
  });
}

export type ActivityQueryFilters = {
  offset?: number;
  take?: number;
  fromIso?: string | null;
  toIso?: string | null;
  userId?: string | null;
  search?: string | null;
  actionsCsv?: string | null;
};

function parseRangeDate(value: string | null | undefined, endOfDay: boolean): Date | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  const withTime =
    trimmed.length <= 10 ? `${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}` : trimmed;
  const d = new Date(withTime);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function buildWhere(filters: ActivityQueryFilters): Prisma.ActivityLogWhereInput {
  const where: Prisma.ActivityLogWhereInput = {};
  const range: Prisma.DateTimeFilter = {};
  const start = parseRangeDate(filters.fromIso ?? null, false);
  const end = parseRangeDate(filters.toIso ?? null, true);
  if (start) range.gte = start;
  if (end) range.lte = end;
  if (start ?? end) where.createdAt = range;
  if (filters.userId) where.userId = filters.userId;
  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { action: { contains: search } },
      { entityType: { contains: search } },
      { entityId: { contains: search } },
    ];
  }
  const actionList = filters.actionsCsv
    ?.split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (actionList?.length) {
    where.action = { in: actionList };
  }
  return where;
}

export async function queryActivityPaged(
  prisma: PrismaClient,
  filters: ActivityQueryFilters,
): Promise<{ items: Awaited<ReturnType<typeof listRecentActivity>>; total: number; hasMore: boolean }> {
  const take = Math.min(Math.max(filters.take ?? 100, 5), 300);
  const offset = Math.min(Math.max(filters.offset ?? 0, 0), 10_000);
  const where = buildWhere(filters);

  const [totalRaw, rows] = await prisma.$transaction([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: take + 1,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    }),
  ]);
  const hasMore = rows.length > take;
  const trimmed = hasMore ? rows.slice(0, take) : rows;

  return { items: trimmed, total: totalRaw, hasMore };
}

export async function listRecentActivity(prisma: PrismaClient, take = 100) {
  return prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  });
}

export function stringifyActivityCsv(rows: Awaited<ReturnType<typeof listRecentActivity>>): string {
  const header =
    ["createdAt", "username", "displayName", "action", "entityType", "entityId", "metadataJson"].join(";");
  const lines = rows.map((r) => {
    const user = r.user;
    const safe = (
      cell: unknown,
      opts?: { iso?: boolean },
    ): string => {
      let v = cell == null ? "" : String(cell);
      if (opts?.iso && cell instanceof Date) v = cell.toISOString();
      v = v.replaceAll('"', '""');
      return `"${v}"`;
    };
    return [
      safe(r.createdAt, { iso: true }),
      safe(user?.username),
      safe(user?.displayName),
      safe(r.action),
      safe(r.entityType),
      safe(r.entityId),
      safe(r.metadata),
    ].join(";");
  });
  return `${header}\n${lines.join("\n")}`;
}
