import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadCsvUtf8 } from "@/lib/csv-download";
import { samyInvoke } from "@/lib/samy";

export function HrReportsPage() {
  const { can } = usePermissions();
  const [range, setRange] = useState({ from: "", to: "" });
  const [cycleId, setCycleId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stamp = useMemo(() => new Date().toISOString().slice(0, 10), []);

  if (!can(PERMISSIONS.PAYROLL_REPORT)) return <Navigate to="/rh/tableau-de-bord" replace />;

  async function pullCsv(label: string, fn: () => Promise<{ csv: string }>, filename: string): Promise<void> {
    setBusy(label);
    setError(null);
    try {
      const res = await fn();
      downloadCsvUtf8(`${filename}-${stamp}.csv`, res.csv);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Rapports RH / Paie"
        subtitle="Exports CSV UTF-8 (Excel) — futurs PDF/bulletins branchés sur les mêmes agrégations ledger."
      />

      {error ? (
        <p className="rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[12px] text-danger">{error}</p>
      ) : null}

      <section className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <label className="text-[11px]">
            Du{" "}
            <input type="date" className="erp-input ml-1 h-8 text-[12px]" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </label>
          <label className="text-[11px]">
            Au{" "}
            <input type="date" className="erp-input ml-1 h-8 text-[12px]" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null || !range.from || !range.to}
            className="rounded border border-border px-2 py-1.5 text-[11px] font-semibold disabled:opacity-40"
            onClick={() =>
              void pullCsv(
                "att",
                () => samyInvoke<{ csv: string }>(IPC_CHANNELS.HR_REPORT_ATTENDANCE_CSV, { from: range.from, to: range.to }),
                "rh-presences",
              )
            }
          >
            {busy === "att" ? "…" : "Présences détaillées"}
          </button>
          <button
            type="button"
            disabled={busy !== null || !range.from || !range.to}
            className="rounded border border-border px-2 py-1.5 text-[11px] font-semibold disabled:opacity-40"
            onClick={() =>
              void pullCsv(
                "ot",
                () => samyInvoke<{ csv: string }>(IPC_CHANNELS.HR_REPORT_OVERTIME_CSV, { from: range.from, to: range.to }),
                "rh-heures-sup",
              )
            }
          >
            {busy === "ot" ? "…" : "Heures supplémentaires"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <input
            className="erp-input h-8 flex-1 min-w-[200px] font-mono text-[11px]"
            placeholder="ID cycle paie (UUID)"
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
          />
          <button
            type="button"
            disabled={busy !== null || !cycleId.trim()}
            className="rounded border border-border px-2 py-1.5 text-[11px] font-semibold disabled:opacity-40"
            onClick={() =>
              void pullCsv(
                "pay",
                () => samyInvoke<{ csv: string }>(IPC_CHANNELS.HR_REPORT_PAYROLL_CSV, cycleId.trim()),
                "rh-masse-salariale",
              )
            }
          >
            {busy === "pay" ? "…" : "Masse salariale cycle"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            className="rounded border border-border px-2 py-1.5 text-[11px] font-semibold disabled:opacity-40"
            onClick={() => void pullCsv("adv", () => samyInvoke<{ csv: string }>(IPC_CHANNELS.HR_REPORT_ADVANCES_CSV), "rh-avances")}
          >
            {busy === "adv" ? "…" : "Grand-livre avances"}
          </button>
        </div>
      </section>
    </div>
  );
}
