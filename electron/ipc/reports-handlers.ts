import { MaterialKind } from "@prisma/client";
import { ipcMain } from "electron";

import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import {
  reportingDateRangeSchema,
  reportingPdfInvoiceSchema,
  reportingPdfPayrollSlipSchema,
  reportingPresetDeleteSchema,
  reportingPresetUpsertSchema,
} from "../../shared/schemas/reporting.js";
import { getPrisma } from "../database.js";
import { logActivity } from "../services/activity-service.js";
import { resolveSessionUser, sessionHasPermission } from "../services/auth-service.js";
import { readPublicBranding } from "../services/branding-service.js";
import { decimalToString, getCurrentQty, parseDecimal } from "../services/inventory-service.js";
import { buildOperationsDirectorWorkbook, buildPayrollExportWorkbook } from "../services/reporting/excel-export-builder.js";
import {
  buildAttendanceSummaryPdf,
  buildInventorySummaryPdf,
  buildInvoicePdf,
  buildPayrollSlipPdf,
  buildProductionSummaryPdf,
} from "../services/reporting/pdf-document-builder.js";
import {
  computeHrAnalytics,
  computeInventoryAnalytics,
  computeProductionAnalytics,
  computeSalesAnalytics,
} from "../services/reporting/reporting-analytics.js";
import { withReportCache } from "../services/reporting/reporting-cache.js";
import {
  computeKpiOverview,
  computeManagementSummary,
  computeProfitabilityOverview,
} from "../services/reporting/reporting-metrics.js";
import { deletePreset, listSavedPresets, upsertPreset } from "../services/reporting/report-preset-service.js";

type ResolvedUser = NonNullable<Awaited<ReturnType<typeof resolveSessionUser>>>;

function requirePermissions(user: ResolvedUser, perms: string | readonly string[]): void {
  if (!sessionHasPermission(user.role.permissions, perms)) throw new Error("Permission refusée.");
}

async function requireUser(): Promise<ResolvedUser> {
  const prisma = getPrisma();
  const user = await resolveSessionUser(prisma);
  if (!user) throw new Error("Non authentifié.");
  return user;
}

function coerceRange(payload: unknown): { from: Date; to: Date } {
  const parsed = reportingDateRangeSchema.safeParse(payload ?? {});
  if (!parsed.success) throw new Error("Période de rapport invalide (from/to).");
  let start = parsed.data.from.trim();
  let end = parsed.data.to.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) start = `${start}T00:00:00.000Z`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(end)) end = `${end}T23:59:59.999Z`;
  return { from: new Date(start), to: new Date(end) };
}

export type ExportedBytesPayload = {
  mimeType: string;
  base64: string;
  filenameSuggested: string;
};

/** Buffer Node garanti sous Electron main ; simplifie l’encodage base64 IPC. */
function base64Encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function registerReportsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.REPORTS_CENTER_SUMMARY, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, PERMISSIONS.REPORTS_READ);

    const { from, to } = coerceRange(payload ?? {});
    const branding = await readPublicBranding(prisma);
    const key = `center-summary:${from.toISOString()}:${to.toISOString()}`;

    const data = await withReportCache(key, async () => {
      const [kpi, unpaidCount, drafts, activeBatches] = await Promise.all([
        computeKpiOverview(prisma, from, to, branding.currencyCode),
        prisma.invoice.count({
          where: { paymentStatus: { not: "PAID" }, status: { in: ["VALIDATED", "PAID"] } },
        }),
        prisma.invoice.count({ where: { status: "DRAFT" } }),
        prisma.productionBatch.count({ where: { status: { in: ["PLANNED", "IN_PROGRESS"] } } }),
      ]);

      const presetsRowCount = await prisma.savedReportPreset.count({ where: { createdById: user.id } });

      return {
        range: { fromIso: from.toISOString(), toIso: to.toISOString() },
        factoryName: branding.factoryName,
        currencyCode: branding.currencyCode,
        kpi,
        navHints: {
          unpaidInvoices: unpaidCount,
          draftInvoices: drafts,
          activeBatches,
        },
        presetsCount: presetsRowCount,
      };
    });

    return data;
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PRESET_LIST, async () => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, PERMISSIONS.REPORTS_READ);
    return listSavedPresets(prisma, user.id);
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PRESET_UPSERT, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, PERMISSIONS.REPORTS_EXPORT);
    const body = reportingPresetUpsertSchema.parse(payload ?? {});
    const row = await upsertPreset(prisma, user.id, {
      id: body.id,
      section: body.section,
      title: body.title,
      filters: body.filters ?? {},
    });
    await logActivity(prisma, {
      userId: user.id,
      action: "REPORT_PRESET_UPSERT",
      entityType: "saved_report_preset",
      entityId: row.id,
      metadata: { section: row.section },
    });
    return row;
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PRESET_DELETE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, PERMISSIONS.REPORTS_EXPORT);
    const body = reportingPresetDeleteSchema.parse(payload ?? {});
    await deletePreset(prisma, user.id, body.id);
    await logActivity(prisma, {
      userId: user.id,
      action: "REPORT_PRESET_DELETE",
      entityType: "saved_report_preset",
      entityId: body.id,
      metadata: {},
    });
    return { ok: true as const };
  });

  const analyticsGuard = PERMISSIONS.ANALYTICS_READ;

  ipcMain.handle(IPC_CHANNELS.REPORTS_ANALYTICS_INVENTORY, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, analyticsGuard);
    const { from, to } = coerceRange(payload ?? {});
    return computeInventoryAnalytics(prisma, from, to);
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_ANALYTICS_PRODUCTION, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, analyticsGuard);
    const { from, to } = coerceRange(payload ?? {});
    return computeProductionAnalytics(prisma, from, to);
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_ANALYTICS_HR, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, analyticsGuard);
    const { from, to } = coerceRange(payload ?? {});
    return computeHrAnalytics(prisma, from, to);
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_ANALYTICS_SALES, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, analyticsGuard);
    const { from, to } = coerceRange(payload ?? {});
    return computeSalesAnalytics(prisma, from, to);
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_KPIS_OVERVIEW, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, analyticsGuard);
    const branding = await readPublicBranding(prisma);
    const { from, to } = coerceRange(payload ?? {});
    const key = `kpis:${from.toISOString()}:${to.toISOString()}`;
    return withReportCache(key, () => computeKpiOverview(prisma, from, to, branding.currencyCode));
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PROFITABILITY_OVERVIEW, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, PERMISSIONS.REPORTS_FINANCIAL);
    const branding = await readPublicBranding(prisma);
    const { from, to } = coerceRange(payload ?? {});
    return computeProfitabilityOverview(prisma, from, to, branding.currencyCode);
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_MANAGEMENT_SUMMARY, async () => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, PERMISSIONS.REPORTS_FINANCIAL);
    const branding = await readPublicBranding(prisma);
    return withReportCache(`mgmt-summary:snap`, () => computeManagementSummary(prisma, branding.currencyCode));
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_EXPORT_OPERATIONS_WORKBOOK, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, PERMISSIONS.REPORTS_EXPORT);

    const { from, to } = coerceRange(payload ?? {});
    const branding = await readPublicBranding(prisma);

    const [kpi, management, profitability, inv, prod, hr, sales] = await Promise.all([
      computeKpiOverview(prisma, from, to, branding.currencyCode),
      computeManagementSummary(prisma, branding.currencyCode),
      computeProfitabilityOverview(prisma, from, to, branding.currencyCode),
      computeInventoryAnalytics(prisma, from, to),
      computeProductionAnalytics(prisma, from, to),
      computeHrAnalytics(prisma, from, to),
      computeSalesAnalytics(prisma, from, to),
    ]);

    const buf = await buildOperationsDirectorWorkbook({
      factoryName: branding.factoryName,
      currency: branding.currencyCode,
      kpi,
      management,
      profitability,
      analytics: { inventory: inv, production: prod, hr, sales },
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "REPORT_EXPORT_XLSX_OPS",
      entityType: "reporting_bundle",
      metadata: { range: `${from.toISOString()}_${to.toISOString()}` },
    });

    return {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
      base64: base64Encode(buf),
      filenameSuggested: `SAMY_OPS_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.xlsx`,
    } satisfies ExportedBytesPayload;
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_EXPORT_PAYROLL_XLSX, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, [PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.PAYROLL_REPORT]);
    const { from, to } = coerceRange(payload ?? {});

    const rowsDb = await prisma.payrollRecord.findMany({
      where: {
        OR: [{ periodEnd: { gte: from, lte: to } }],
      },
      include: { worker: true },
      take: 2000,
      orderBy: [{ periodEnd: "desc" }],
    });

    const buf = await buildPayrollExportWorkbook(
      rowsDb.map((r) => ({
        workerCode: r.worker.code,
        workerName: `${r.worker.lastName.toUpperCase()} ${r.worker.firstName}`,
        periodStart: r.periodStart.toISOString().slice(0, 10),
        periodEnd: r.periodEnd.toISOString().slice(0, 10),
        gross: Number.parseFloat(decimalToString(r.grossAmount)),
        net: Number.parseFloat(decimalToString(r.netAmount)),
        status: r.status,
      })),
    );

    await logActivity(prisma, {
      userId: user.id,
      action: "REPORT_EXPORT_XLSX_PAYROLL",
      entityType: "payroll_bundle",
      metadata: {},
    });

    return {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
      base64: base64Encode(buf),
      filenameSuggested: `SAMY_PAIE_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.xlsx`,
    } satisfies ExportedBytesPayload;
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PDF_INVOICE, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, [PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.SALES_REPORT]);
    const body = reportingPdfInvoiceSchema.parse(payload ?? {});
    const branding = await readPublicBranding(prisma);
    const pdf = await buildInvoicePdf(prisma, body.invoiceId, {
      factoryName: branding.factoryName,
      currencyCode: branding.currencyCode,
    });

    await logActivity(prisma, {
      userId: user.id,
      action: "REPORT_EXPORT_PDF_INVOICE",
      entityType: "invoice",
      entityId: body.invoiceId,
      metadata: {},
    });

    return {
      mimeType: "application/pdf" as const,
      base64: base64Encode(pdf),
      filenameSuggested: `facture_${body.invoiceId.slice(0, 8)}.pdf`,
    } satisfies ExportedBytesPayload;
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PDF_PAYROLL_SLIP, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, [PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.PAYROLL_REPORT]);
    const body = reportingPdfPayrollSlipSchema.parse(payload ?? {});
    const branding = await readPublicBranding(prisma);
    const pdf = await buildPayrollSlipPdf(prisma, body.payrollRecordId, { factoryName: branding.factoryName });

    await logActivity(prisma, {
      userId: user.id,
      action: "REPORT_EXPORT_PDF_PAYSLIP",
      entityType: "payroll_record",
      entityId: body.payrollRecordId,
      metadata: {},
    });

    return {
      mimeType: "application/pdf" as const,
      base64: base64Encode(pdf),
      filenameSuggested: `bulletin_${body.payrollRecordId.slice(0, 8)}.pdf`,
    } satisfies ExportedBytesPayload;
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PDF_INVENTORY_SUMMARY, async (_evt, _payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, [PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.INVENTORY_REPORT]);
    const branding = await readPublicBranding(prisma);

    const raws = await prisma.rawMaterial.findMany({
      where: { isActive: true },
      orderBy: { sku: "asc" },
      take: 180,
    });

    type LineRow = { label: string; sku: string; qty: string; value: string };

    const lines: LineRow[] = [];
    for (const rm of raws) {
      const qty = await getCurrentQty(prisma, MaterialKind.RAW, rm.id);
      const pu = parseDecimal(decimalToString(rm.costPriceUnit));
      const val = qty.mul(pu);
      lines.push({
        label: rm.labelFr,
        sku: rm.sku,
        qty: decimalToString(qty),
        value: decimalToString(val),
      });
    }

    const pdf = await buildInventorySummaryPdf(
      {
        factoryName: branding.factoryName,
        currencyCode: branding.currencyCode,
      },
      lines,
    );

    await logActivity(prisma, {
      userId: user.id,
      action: "REPORT_EXPORT_PDF_INV",
      entityType: "inventory_summary",
      metadata: { rows: lines.length },
    });

    return {
      mimeType: "application/pdf" as const,
      base64: base64Encode(pdf),
      filenameSuggested: "inventaire_stocks_mp_resume.pdf",
    } satisfies ExportedBytesPayload;
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PDF_PRODUCTION_SUMMARY, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, [PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.PRODUCTION_REPORT]);
    const branding = await readPublicBranding(prisma);
    const { from, to } = coerceRange(payload ?? {});

    const batches = await prisma.productionBatch.findMany({
      where: { finishedAt: { not: null, gte: from, lte: to } },
      include: { recipe: true },
      take: 200,
      orderBy: { finishedAt: "desc" },
    });

    const pdf = await buildProductionSummaryPdf(
      { factoryName: branding.factoryName },
      batches.map((b) => ({
        code: b.code,
        recipeLabel: b.recipe.labelFr,
        planned: decimalToString(b.plannedQty),
        produced: b.producedQty != null ? decimalToString(b.producedQty) : "—",
        status: b.status,
        finishedIso: b.finishedAt ? b.finishedAt.toISOString() : "",
      })),
    );

    await logActivity(prisma, {
      userId: user.id,
      action: "REPORT_EXPORT_PDF_BATCH",
      entityType: "production_summary",
      metadata: {},
    });

    return {
      mimeType: "application/pdf" as const,
      base64: base64Encode(pdf),
      filenameSuggested: `production_${from.toISOString().slice(0, 10)}.pdf`,
    } satisfies ExportedBytesPayload;
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PDF_ATTENDANCE_SUMMARY, async (_evt, payload: unknown) => {
    const prisma = getPrisma();
    const user = await requireUser();
    requirePermissions(user, [PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.PAYROLL_REPORT]);
    const branding = await readPublicBranding(prisma);
    const { from, to } = coerceRange(payload ?? {});

    const rows = await prisma.attendanceRecord.findMany({
      where: { workedDate: { gte: from, lte: to } },
      include: { worker: true },
      take: 500,
      orderBy: [{ workedDate: "desc" }],
    });

    const pdf = await buildAttendanceSummaryPdf(
      { factoryName: branding.factoryName },
      rows.map((r) => ({
        date: r.workedDate.toISOString().slice(0, 10),
        worker: `${r.worker.firstName} ${r.worker.lastName}`,
        status: r.status,
        hours: `${decimalToString(r.totalWorkedHours ?? 0)} h · HS ${decimalToString(r.overtimeHours ?? 0)}`,
      })),
    );

    await logActivity(prisma, {
      userId: user.id,
      action: "REPORT_EXPORT_PDF_ATTENDANCE",
      entityType: "attendance_summary",
      metadata: {},
    });

    return {
      mimeType: "application/pdf" as const,
      base64: base64Encode(pdf),
      filenameSuggested: `presences_${from.toISOString().slice(0, 10)}.pdf`,
    } satisfies ExportedBytesPayload;
  });
}
