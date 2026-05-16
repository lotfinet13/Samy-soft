import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

type Adv = {
  id: string;
  workerId: string;
  amount: string;
  paymentDate: string;
  repaymentStatus: string;
  reason: string | null;
  worker: { code: string; firstName: string; lastName: string };
};

type WorkerBrief = { id: string; code: string; firstName: string; lastName: string };

export function HrAdvancesPage() {
  const { can } = usePermissions();
  const [rows, setRows] = useState<Adv[]>([]);
  const [workers, setWorkers] = useState<WorkerBrief[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ workerId: "", amount: "", paymentDate: "", reason: "" });

  async function refresh(): Promise<void> {
    const res = await samyInvoke<{ items: Adv[] }>(IPC_CHANNELS.HR_ADVANCE_LIST);
    setRows(res.items);
  }

  useEffect(() => {
    void (async () => {
      try {
        const wRes = await samyInvoke<{ items: WorkerBrief[] }>(IPC_CHANNELS.HR_WORKER_LIST, { take: 400 });
        setWorkers(wRes.items);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (!can(PERMISSIONS.PAYROLL_READ)) return <Navigate to="/rh/tableau-de-bord" replace />;

  async function createAdv(): Promise<void> {
    if (!can(PERMISSIONS.PAYROLL_EXECUTE)) return;
    setError(null);
    try {
      await samyInvoke(IPC_CHANNELS.HR_ADVANCE_CREATE, {
        workerId: form.workerId,
        amount: form.amount,
        paymentDate: form.paymentDate,
        reason: form.reason || null,
      });
      setForm({ workerId: "", amount: "", paymentDate: "", reason: "" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Avances sur salaire"
        subtitle="Montants immuables avec motif — récupération automatique sur cycles paie (grand-livre PayrollAdvanceRecovery)."
      />

      {error ? (
        <p className="rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[12px] text-danger">{error}</p>
      ) : null}

      <section className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-3">
        <h2 className="mb-2 text-[12px] font-bold uppercase text-foreground-muted">Nouvelle avance</h2>
        <div className="flex flex-wrap gap-2">
          <select
            className="erp-input h-8 text-[12px]"
            disabled={!can(PERMISSIONS.PAYROLL_EXECUTE)}
            value={form.workerId}
            onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
          >
            <option value="">— Employé —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.lastName} {w.firstName}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="erp-input h-8 text-[12px]"
            disabled={!can(PERMISSIONS.PAYROLL_EXECUTE)}
            value={form.paymentDate}
            onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
          />
          <input
            className="erp-input h-8 w-28 font-mono text-[12px]"
            placeholder="Montant DZD"
            disabled={!can(PERMISSIONS.PAYROLL_EXECUTE)}
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <input
            className="erp-input h-8 flex-1 min-w-[140px] text-[12px]"
            placeholder="Motif"
            disabled={!can(PERMISSIONS.PAYROLL_EXECUTE)}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          />
          {can(PERMISSIONS.PAYROLL_EXECUTE) ? (
            <button type="button" className="h-8 rounded bg-accent px-2 text-[12px] font-semibold text-background" onClick={() => void createAdv()}>
              Enregistrer
            </button>
          ) : null}
        </div>
      </section>

      <div className="overflow-x-auto rounded-[var(--erp-radius-panel)] border border-border bg-surface">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-border bg-surface-muted/50 text-[10px] font-semibold uppercase text-foreground-muted">
              <th className="px-2 py-1">Date</th>
              <th className="px-2 py-1">Employé</th>
              <th className="px-2 py-1 text-right">Montant</th>
              <th className="px-2 py-1">Statut</th>
              <th className="px-2 py-1">Motif</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/70">
                <td className="px-2 py-1 font-mono">{r.paymentDate.slice(0, 10)}</td>
                <td className="px-2 py-1">
                  {r.worker.code} {r.worker.lastName}
                </td>
                <td className="px-2 py-1 text-right font-mono">{r.amount}</td>
                <td className="px-2 py-1">{r.repaymentStatus}</td>
                <td className="px-2 py-1 text-foreground-muted">{r.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
