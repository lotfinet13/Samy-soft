import type { PrismaClient } from "@prisma/client";

import type { ReportingPresetSection } from "../../../shared/schemas/reporting.js";

export type SavedPresetDTO = {
  id: string;
  section: string;
  title: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export async function listSavedPresets(
  prisma: PrismaClient,
  userId: string,
): Promise<SavedPresetDTO[]> {
  const rows = await prisma.savedReportPreset.findMany({
    where: { createdById: userId },
    orderBy: [{ section: "asc" }, { title: "asc" }],
  });

  return rows.map((row) => {
    let filters: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(row.filtersJson);
      filters = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      filters = {};
    }
    return {
      id: row.id,
      section: row.section,
      title: row.title,
      filters,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function upsertPreset(
  prisma: PrismaClient,
  userId: string,
  opts: {
    id?: string;
    section: ReportingPresetSection;
    title: string;
    filters: Record<string, unknown>;
  },
): Promise<SavedPresetDTO> {
  const filtersJson = JSON.stringify(opts.filters ?? {});
  const row =
    opts.id != null
      ? await prisma.savedReportPreset.update({
          where: { id: opts.id, createdById: userId },
          data: {
            section: opts.section,
            title: opts.title.trim(),
            filtersJson,
          },
        })
      : await prisma.savedReportPreset.create({
          data: {
            createdById: userId,
            section: opts.section,
            title: opts.title.trim(),
            filtersJson,
          },
        });

  return {
    id: row.id,
    section: row.section,
    title: row.title,
    filters: opts.filters ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deletePreset(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<void> {
  await prisma.savedReportPreset.delete({
    where: { id, createdById: userId },
  });
}
