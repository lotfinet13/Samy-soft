import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { AsyncStatePanel } from "@/components/system/AsyncStatePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAsyncLoad } from "@/hooks/useAsyncLoad";
import { downloadBase64Blob } from "@/lib/binary-download";
import { usePermissions } from "@/hooks/usePermissions";
import { invalidateHrCaches, invalidateReportsCaches } from "@/lib/invalidate-ui-cache";
import { samyInvoke } from "@/lib/samy";

type Cycle = {
  id: string;
  label: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  payrollRecordCount: number;
};

type PrRow = {
  id: string;
  workerId: string;
  grossAmount: string;
  netAmount: string;
  status: string;
  worker: { code: string; firstName: string; lastName: string };
};

export function HrPayrollCyclesPage() {
  const { can } = usePermissions();
  const [selected, setSelected] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", periodStart: "", periodEnd: "" });
  const [adjForm, setAdjForm] = useState({ payrollRecordId: "", kind: "BONUS" as "BONUS" | "DEDUCTION" | "CORRECTION", amount: "", reason: "" });

  const {
    data: cyclesData,
    loading: cyclesLoading,
    error: cyclesError,
    reload: loadCycles,
  } = useAsyncLoad(() => samyInvoke<{ items: Cycle[] }>(IPC_CHANNELS.HR_PAYROLL_CYCLE_LIST), []);

  const cycles = cyclesData?.items ?? [];

  const {
    data: recordsData,
    loading: recordsLoading,
    error: recordsError,
    reload: loadRecords,
  } = useAsyncLoad(
    () => samyInvoke<{ items: PrRow[] }>(IPC_CHANNELS.HR_PAYROLL_CYCLE_RECORDS, selected!),
    [selected],
    { immediate: Boolean(selected) },
  );

  const records = selected ? (recordsData?.items ?? []) : [];

  if (!can(PERMISSIONS.PAYROLL_READ)) return <Navigate to="/rh/tableau-de-bord" replace />;

  const canPdfPayrollSlip = can(PERMISSIONS.REPORTS_EXPORT) && can(PERMISSIONS.PAYROLL_REPORT);

  async function createCycle(): Promise<void> {
    if (!can(PERMISSIONS.PAYROLL_EXECUTE)) return;
    setActionError(null);
    try {
      await samyInvoke(IPC_CHANNELS.HR_PAYROLL_CYCLE_CREATE, {
        label: form.label || null,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
      });
      invalidateHrCaches();
      invalidateReportsCaches();
      setForm({ label: "", periodStart: "", periodEnd: "" });
      await loadCycles();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function compute(): Promise<void> {
    if (!selected || !can(PERMISSIONS.PAYROLL_EXECUTE)) return;
    await samyInvoke(IPC_CHANNELS.HR_PAYROLL_COMPUTE, { payrollCycleId: selected });
    invalidateHrCaches();
    invalidateReportsCaches();
    await loadRecords();
    await loadCycles();
  }

  async function lock(): Promise<void> {
    if (!selected || !can(PERMISSIONS.PAYROLL_EXECUTE)) return;
    await samyInvoke(IPC_CHANNELS.HR_PAYROLL_CYCLE_LOCK, { payrollCycleId: selected });
    invalidateHrCaches();
    invalidateReportsCaches();
    await loadCycles();
  }

  async function pdfPayrollSlip(recordId: string): Promise<void> {
    setActionError(null);
    try {
      const res = await samyInvoke<{ base64: string; filenameSuggested: string }>(IPC_CHANNELS.REPORTS_PDF_PAYROLL_SLIP, {
        payrollRecordId: recordId,
      });
      downloadBase64Blob(res, "application/pdf", res.filenameSuggested);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function addAdjustment(): Promise<void> {
    if (!can(PERMISSIONS.PAYROLL_ADJUST)) return;
    await samyInvoke(IPC_CHANNELS.HR_PAYROLL_ADJUSTMENT_ADD, {
      payrollRecordId: adjForm.payrollRecordId,
      kind: adjForm.kind,
      amount: adjForm.amount,
      reason: adjForm.reason || null,
    });
    invalidateHrCaches();
    invalidateReportsCaches();
    if (selected) await loadRecords();
  }

  const selCycle = cycles.find((c) => c.id === selected);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cycles de paie"
        subtitle="Moteur ledger : recalcul depuis présences + ajustements datés + récupération avances tracées."
      />

      {actionError ? (
        <p className="rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[12px] text-danger">{actionError}</p>
      ) : null}

      <section className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-3">
        <h2 className="mb-2 text-[12px] font-bold uppercase text-foreground-muted">Nouveau cycle</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="erp-input h-8 text-[12px]"
            placeholder="Libellé"
            value={form.label}
            disabled={!can(PERMISSIONS.PAYROLL_EXECUTE)}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
          <input
            type="date"
            className="erp-input h-8 text-[12px]"
            value={form.periodStart}
            disabled={!can(PERMISSIONS.PAYROLL_EXECUTE)}
            onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
          />
          <input
            type="date"
            className="erp-input h-8 text-[12px]"
            value={form.periodEnd}
            disabled={!can(PERMISSIONS.PAYROLL_EXECUTE)}
            onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
          />
          {can(PERMISSIONS.PAYROLL_EXECUTE) ? (
            <button type="button" className="h-8 rounded bg-accent px-2 text-[12px] font-semibold text-background" onClick={() => void createCycle()}>
              Créer
            </button>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-2">
          <h3 className="mb-2 text-[11px] font-bold uppercase text-foreground-muted">Cycles</h3>
          <AsyncStatePanel loading={cyclesLoading} error={cyclesError} onRetry={() => void loadCycles()} loadingLabel="Chargement des cycles…">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-border text-[10px] text-foreground-muted">
                <th className="py-1">Période</th>
                <th className="py-1">Statut</th>
                <th className="py-1 text-right">Fiches</th>
                <th className="py-1 text-right">Voir</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id} className="border-b border-border/70">
                  <td className="py-1 font-mono text-[10px]">
                    {c.periodStart.slice(0, 10)} → {c.periodEnd.slice(0, 10)}
                  </td>
                  <td className="py-1">{c.status}</td>
                  <td className="py-1 text-right">{c.payrollRecordCount}</td>
                  <td className="py-1 text-right">
                    <button type="button" className="text-accent hover:underline" onClick={() => setSelected(c.id)}>
                      Sélectionner
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </AsyncStatePanel>
        </div>

        <div className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase text-foreground-muted">Fiches paie — cycle courant</h3>
            {selected && selCycle?.status === "DRAFT" && can(PERMISSIONS.PAYROLL_EXECUTE) ? (
              <div className="flex gap-2">
                <button type="button" className="rounded border border-border px-2 py-1 text-[11px] font-semibold" onClick={() => void compute()}>
                  Recalculer
                </button>
                <button type="button" className="rounded border border-warning px-2 py-1 text-[11px] font-semibold text-warning" onClick={() => void lock()}>
                  Verrouiller
                </button>
              </div>
            ) : null}
          </div>
          {!selected ? (
            <p className="text-[12px] text-foreground-muted">Sélectionnez un cycle.</p>
          ) : (
            <AsyncStatePanel
              loading={recordsLoading}
              error={recordsError}
              onRetry={() => void loadRecords()}
              loadingLabel="Chargement des fiches paie…"
            >
            <table className="w-full border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-border text-[10px] text-foreground-muted">
                  <th className="py-1">Employé</th>
                  <th className="py-1 text-right">Brut</th>
                  <th className="py-1 text-right">Net</th>
                  <th className="py-1">St.</th>
                  {canPdfPayrollSlip ? <th className="py-1 text-right">PDF</th> : null}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-border/70">
                    <td className="py-1">
                      <span className="font-mono text-[10px]">{r.worker.code}</span> {r.worker.lastName}
                    </td>
                    <td className="py-1 text-right font-mono">{r.grossAmount}</td>
                    <td className="py-1 text-right font-mono">{r.netAmount}</td>
                    <td className="py-1">{r.status}</td>
                    {canPdfPayrollSlip ? (
                      <td className="py-1 text-right whitespace-nowrap">
                        <button
                          type="button"
                          className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold hover:bg-surface-muted"
                          onClick={() => void pdfPayrollSlip(r.id)}
                          title="Télécharger le bulletin PDF"
                        >
                          PDF
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            </AsyncStatePanel>
          )}

          {selected && selCycle?.status === "DRAFT" && can(PERMISSIONS.PAYROLL_ADJUST) ? (
            <div className="mt-3 border-t border-border pt-3">
              <h4 className="mb-2 text-[10px] font-bold uppercase text-foreground-muted">Ajustement manuel</h4>
              <div className="flex flex-wrap gap-2">
                <select
                  className="erp-input h-8 text-[11px]"
                  value={adjForm.payrollRecordId}
                  onChange={(e) => setAdjForm((a) => ({ ...a, payrollRecordId: e.target.value }))}
                >
                  <option value="">— Fiche —</option>
                  {records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.worker.code} · {r.worker.lastName}
                    </option>
                  ))}
                </select>
                <select
                  className="erp-input h-8 text-[11px]"
                  value={adjForm.kind}
                  onChange={(e) => setAdjForm((a) => ({ ...a, kind: e.target.value as typeof adjForm.kind }))}
                >
                  <option value="BONUS">Prime</option>
                  <option value="DEDUCTION">Retenue</option>
                  <option value="CORRECTION">Correction (±)</option>
                </select>
                <input
                  className="erp-input h-8 w-24 font-mono text-[11px]"
                  placeholder="Montant"
                  value={adjForm.amount}
                  onChange={(e) => setAdjForm((a) => ({ ...a, amount: e.target.value }))}
                />
                <input
                  className="erp-input h-8 flex-1 min-w-[120px] text-[11px]"
                  placeholder="Motif"
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm((a) => ({ ...a, reason: e.target.value }))}
                />
                <button type="button" className="h-8 rounded bg-surface-muted px-2 text-[11px] font-semibold" onClick={() => void addAdjustment()}>
                  Appliquer
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

