import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { reportingPresetUpsertSchema } from "@shared/schemas/reporting";
import { FileSpreadsheet, FileText, Receipt, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AsyncStatePanel } from "@/components/system/AsyncStatePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAsyncLoad } from "@/hooks/useAsyncLoad";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadBase64Blob } from "@/lib/binary-download";
import { samyInvoke } from "@/lib/samy";

function monthIsoRange(): { from: string; to: string } {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

type SavedPresetDTO = {
  id: string;
  section: string;
  title: string;
  filters: Record<string, unknown>;
};

type CenterSummaryDTO = {
  currencyCode: string;
  factoryName: string;
  kpi: {
    completedBatches: number;
    salesValidatedCount: number;
    payrollBurden: number;
    productionCostRatio: number;
    inventoryTurnoverApprox: number;
  };
  navHints: { unpaidInvoices: number; draftInvoices: number; activeBatches: number };
  presetsCount: number;
};

export function ReportingCenterPage() {
  const { can } = usePermissions();

  const [from, setFrom] = useState(() => monthIsoRange().from.slice(0, 10));
  const [to, setTo] = useState(() => monthIsoRange().to.slice(0, 10));
  const [presets, setPresets] = useState<SavedPresetDTO[]>([]);
  const [presetTitle, setPresetTitle] = useState("Ma période");

  const rangeIso = useCallback(
    () => ({
      from: new Date(from + "T00:00:00.000Z").toISOString(),
      to: new Date(to + "T23:59:59.999Z").toISOString(),
    }),
    [from, to],
  );

  const refreshPresets = useCallback(async (): Promise<void> => {
    if (!can(PERMISSIONS.REPORTS_READ)) return;
    const rows = await samyInvoke<SavedPresetDTO[]>(IPC_CHANNELS.REPORTS_PRESET_LIST);
    setPresets(rows);
  }, [can]);

  const {
    data: summary,
    loading: summaryLoading,
    error: summaryError,
    reload: refreshSummary,
  } = useAsyncLoad(
    () => samyInvoke<CenterSummaryDTO>(IPC_CHANNELS.REPORTS_CENTER_SUMMARY, rangeIso()),
    [from, to, can],
    { immediate: can(PERMISSIONS.REPORTS_READ) },
  );

  useEffect(() => {
    void refreshPresets();
  }, [refreshPresets]);

  async function exportOpsXlsx(): Promise<void> {
    if (!can(PERMISSIONS.REPORTS_EXPORT)) return;
    const res = await samyInvoke<{ base64: string; filenameSuggested: string }>(
      IPC_CHANNELS.REPORTS_EXPORT_OPERATIONS_WORKBOOK,
      rangeIso(),
    );
    downloadBase64Blob(
      res,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      res.filenameSuggested,
    );
  }

  async function exportPayrollXlsx(): Promise<void> {
    if (!can(PERMISSIONS.REPORTS_EXPORT)) return;
    const res = await samyInvoke<{ base64: string; filenameSuggested: string }>(
      IPC_CHANNELS.REPORTS_EXPORT_PAYROLL_XLSX,
      rangeIso(),
    );
    downloadBase64Blob(
      res,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      res.filenameSuggested,
    );
  }

  async function pdf(kind: string): Promise<void> {
    if (!can(PERMISSIONS.REPORTS_EXPORT)) return;

    switch (kind) {
      case "inventory": {
        const res = await samyInvoke<{ base64: string; filenameSuggested: string }>(
          IPC_CHANNELS.REPORTS_PDF_INVENTORY_SUMMARY,
        );
        downloadBase64Blob(res, "application/pdf", res.filenameSuggested);
        return;
      }
      case "production": {
        const res = await samyInvoke<{ base64: string; filenameSuggested: string }>(
          IPC_CHANNELS.REPORTS_PDF_PRODUCTION_SUMMARY,
          rangeIso(),
        );
        downloadBase64Blob(res, "application/pdf", res.filenameSuggested);
        return;
      }
      case "attendance": {
        const res = await samyInvoke<{ base64: string; filenameSuggested: string }>(
          IPC_CHANNELS.REPORTS_PDF_ATTENDANCE_SUMMARY,
          rangeIso(),
        );
        downloadBase64Blob(res, "application/pdf", res.filenameSuggested);
        return;
      }
      default:
        break;
    }
  }

  async function savePreset(): Promise<void> {
    if (!can(PERMISSIONS.REPORTS_EXPORT)) return;
    const payload = reportingPresetUpsertSchema.parse({
      section: "kpi",
      title: presetTitle,
      filters: { from: rangeIso().from, to: rangeIso().to },
    });
    await samyInvoke(IPC_CHANNELS.REPORTS_PRESET_UPSERT, payload);
    await refreshPresets();
    await refreshSummary();
  }

  async function deletePreset(id: string): Promise<void> {
    if (!can(PERMISSIONS.REPORTS_EXPORT)) return;
    await samyInvoke(IPC_CHANNELS.REPORTS_PRESET_DELETE, { id });
    await refreshPresets();
    await refreshSummary();
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Centre reporting — ${summary?.factoryName ?? "chargement..."}`}
        subtitle="Synthèses transversales, presets filtrés, Excel multi-feuilles & PDF natives (architecture prête impressions thermiques A4)."
      />

      {!can(PERMISSIONS.REPORTS_READ) ? (
        <p className="text-sm text-danger">Permission reports.read requise.</p>
      ) : null}

      <section className="erp-panel flex flex-wrap items-end gap-3 p-4 text-[13px]">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Du
          <input type="date" className="control-chrome h-9 px-2" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Au
          <input type="date" className="control-chrome h-9 px-2" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="control-chrome h-9 px-4 text-[12px] font-semibold" onClick={() => void refreshSummary()}>
          Rafraîchir agrégats
        </button>
      </section>

      <AsyncStatePanel
        loading={summaryLoading}
        error={summaryError}
        onRetry={() => void refreshSummary()}
        loadingLabel="Chargement des agrégats transversaux…"
      >
      {summary ? (
        <section className="grid gap-3 md:grid-cols-5">
          <KpiChip label="CA facturations (jour)" value={`${summary.kpi.salesValidatedCount}`} subtitle="documents validés" />
          <KpiChip label="Lots clôturés" value={`${summary.kpi.completedBatches}`} subtitle="fabrication" />
          <KpiChip
            label="Charge paie / CA fenêtre courte"
            value={`${(summary.kpi.payrollBurden * 100).toFixed(1)} %`}
            subtitle="indicateur cockpit"
          />
          <KpiChip
            label="Coût MP / CA court"
            value={`${(summary.kpi.productionCostRatio * 100).toFixed(1)} %`}
            subtitle="lots terminés"
          />
          <KpiChip label="Pulse achats" value={`${summary.kpi.inventoryTurnoverApprox.toFixed(2)}`} subtitle="ratio approx." />
          <KpiChip label="Clients impayés" value={`${summary.navHints.unpaidInvoices}`} subtitle="soldes résiduels comptabilisés" />
          <KpiChip label="Brouillons vente" value={`${summary.navHints.draftInvoices}`} subtitle="À valider ou annuler" />
          <KpiChip label="Lots actifs" value={`${summary.navHints.activeBatches}`} subtitle="fab en cours ou planifiés" />
        </section>
      ) : (
        <p className="text-[12px] text-foreground-muted">Aucun agrégat pour cette période.</p>
      )}
      </AsyncStatePanel>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="erp-panel space-y-3 p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <FileSpreadsheet className="h-5 w-5 text-accent" strokeWidth={2.25} />
            Exports Excel professionnels (.xlsx)
          </div>
          <div className="grid gap-2 text-[12px] text-foreground-muted">
            {!can(PERMISSIONS.REPORTS_EXPORT) ? <span className="text-danger">reports.export absent.</span> : null}
            <button
              type="button"
              disabled={!can(PERMISSIONS.REPORTS_EXPORT)}
              className="focus-ring rounded-xl border border-border bg-surface px-4 py-3 text-left text-[13px] font-semibold hover:bg-surface-elevated disabled:opacity-40"
              onClick={() => void exportOpsXlsx()}
            >
              Classeur direction — multi-feux (KPI, ventes, stock, RH, paie synthèse rentabilité)
            </button>
            <button
              type="button"
              disabled={!can(PERMISSIONS.REPORTS_EXPORT) || !can(PERMISSIONS.PAYROLL_REPORT)}
              className="focus-ring rounded-xl border border-border bg-surface px-4 py-3 text-left text-[13px] font-semibold hover:bg-surface-elevated disabled:opacity-40"
              onClick={() => void exportPayrollXlsx()}
            >
              Dette paie & bulletins agrégés (paie CSV existante complétée Excel)
            </button>
          </div>
        </div>

        <div className="erp-panel space-y-3 p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <FileText className="h-5 w-5 text-accent" strokeWidth={2.25} />
            PDF natives (layouts A4, structure thermiques)
          </div>
          <div className="grid gap-2 text-[12px]">
            {!can(PERMISSIONS.REPORTS_EXPORT) ? <span className="text-danger">reports.export absent.</span> : null}
            <button
              type="button"
              disabled={!can(PERMISSIONS.REPORTS_EXPORT) || !can(PERMISSIONS.INVENTORY_REPORT)}
              className="focus-ring rounded-xl border border-border px-4 py-2 text-left hover:bg-surface-elevated disabled:opacity-40"
              onClick={() => void pdf("inventory")}
            >
              Synthèse stock MP valorisée
            </button>
            <button
              type="button"
              disabled={!can(PERMISSIONS.REPORTS_EXPORT) || !can(PERMISSIONS.PRODUCTION_REPORT)}
              className="focus-ring rounded-xl border border-border px-4 py-2 text-left hover:bg-surface-elevated disabled:opacity-40"
              onClick={() => void pdf("production")}
            >
              Synthèse lots production (période)
            </button>
            <button
              type="button"
              disabled={!can(PERMISSIONS.REPORTS_EXPORT) || !can(PERMISSIONS.PAYROLL_REPORT)}
              className="focus-ring rounded-xl border border-border px-4 py-2 text-left hover:bg-surface-elevated disabled:opacity-40"
              onClick={() => void pdf("attendance")}
            >
              Synthèse présences & heures HS
            </button>
          </div>
          <p className="text-[11px] text-foreground-muted">
            Facturation PDF & bulletins nominatifs depuis l’historique métier&nbsp;: utiliser depuis facture / bulletin paie (canaux IPC
            `reports.pdf.invoice`).
          </p>
        </div>
      </section>

      <section className="erp-panel space-y-3 p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Receipt className="h-5 w-5 text-accent" strokeWidth={2.25} />
          Presets de filtre utilisateur ({summary?.presetsCount ?? presets.length})
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <input
            className="control-chrome h-9 min-w-[200px] flex-1 px-2 text-[13px]"
            value={presetTitle}
            onChange={(e) => setPresetTitle(e.target.value)}
            placeholder="Titre preset"
          />
          <button
            type="button"
            disabled={!can(PERMISSIONS.REPORTS_EXPORT)}
            className="focus-ring rounded-xl bg-accent px-5 py-2 text-[13px] font-semibold text-accent-foreground disabled:opacity-40"
            onClick={() => void savePreset()}
          >
            Mémoriser la période
          </button>
        </div>
        <ul className="space-y-2 text-[13px]">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <span className="font-semibold text-foreground">{preset.title}</span>
                <span className="ml-2 rounded-md bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  {preset.section}
                </span>
                <span className="mt-1 block truncate text-[11px] text-foreground-muted">
                  {typeof preset.filters.from === "string" ? preset.filters.from.slice(0, 16) : "—"}
                  {" · "}
                  {typeof preset.filters.to === "string" ? preset.filters.to.slice(0, 16) : "—"}
                </span>
              </div>
              <button
                type="button"
                aria-label={`Supprimer ${preset.title}`}
                disabled={!can(PERMISSIONS.REPORTS_EXPORT)}
                className="focus-ring inline-flex rounded-lg border border-border p-2 text-danger hover:bg-surface-muted disabled:opacity-40"
                onClick={() => void deletePreset(preset.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function KpiChip(props: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="erp-panel border border-border p-3 shadow-none">
      <div className="text-[11px] font-semibold uppercase leading-tight text-foreground-muted">{props.label}</div>
      <div className="mt-1 font-mono text-[19px] font-bold text-foreground">{props.value}</div>
      {props.subtitle ? <div className="text-[11px] text-foreground-muted">{props.subtitle}</div> : null}
    </div>
  );
}
