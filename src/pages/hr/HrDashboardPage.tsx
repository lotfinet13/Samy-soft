import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

type Dash = {
  today: { date: string; punchCount: number; presentApprox: number };
  absentWorkers: Array<{ id: string; code: string; firstName: string; lastName: string }>;
  overtimeAlerts: Array<{
    worker: { code: string; firstName: string; lastName: string };
    overtimeHours: string;
    status: string;
  }>;
  payrollDraftCycles: Array<{ id: string; label: string | null; periodStart: string; periodEnd: string }>;
  payrollTotalsDraft: { gross: string; net: string; advances: string; count: number };
  recentWorkerActivity: Array<{
    id: string;
    action: string;
    entityId: string | null;
    createdAt: string;
    user: { displayName: string; username: string } | null;
  }>;
};

export function HrDashboardPage() {
  const { can } = usePermissions();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await samyInvoke<Dash>(IPC_CHANNELS.HR_DASHBOARD_SUMMARY);
        setData(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (!can(PERMISSIONS.HR_READ)) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Centre de contrôle RH — Usine"
        subtitle="Présences du jour, alertes heures sup, masse salariale brouillon, traçabilité employés."
      />
      {error ? (
        <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Pointages / jour" value={String(data?.today.punchCount ?? "…")} hint="Entrées présence enregistrées" />
        <StatCard label="Présents (estim.)" value={String(data?.today.presentApprox ?? "…")} hint="Statuts travail effectif" />
        <StatCard label="Absents sans pointage" value={String(data?.absentWorkers.length ?? "…")} tone="warning" />
        <StatCard label="Alertes HS jour" value={String(data?.overtimeAlerts.length ?? "…")} hint="Heures sup renseignées" />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-3">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-foreground-muted">Absents (sans présence valide)</h2>
          {data?.absentWorkers.length ? (
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-[10.5px] font-semibold uppercase text-foreground-muted">
                  <th className="py-1.5">Code</th>
                  <th className="py-1.5">Employé</th>
                  <th className="py-1.5 text-right">Profil</th>
                </tr>
              </thead>
              <tbody>
                {data.absentWorkers.map((w) => (
                  <tr key={w.id} className="border-b border-border/70">
                    <td className="py-1.5 font-mono">{w.code}</td>
                    <td className="py-1.5">
                      {w.lastName} {w.firstName}
                    </td>
                    <td className="py-1.5 text-right">
                      <Link className="text-accent hover:underline" to={`/rh/effectifs/${w.id}`}>
                        Fiche
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[12px] text-foreground-muted">Aucune absence détectée ou pas encore de pointages.</p>
          )}
        </div>

        <div className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-3">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-foreground-muted">Heures supplémentaires — jour</h2>
          {data?.overtimeAlerts.length ? (
            <ul className="space-y-1.5 text-[12px]">
              {data.overtimeAlerts.map((o, i) => (
                <li key={i} className="flex justify-between gap-3 border border-border/80 px-2 py-1.5">
                  <span className="font-semibold">
                    {o.worker.code} · {o.worker.lastName} {o.worker.firstName}
                  </span>
                  <span className="font-mono text-accent">{o.overtimeHours} h</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-foreground-muted">Aucune ligne HS pour la journée.</p>
          )}
        </div>
      </section>

      {can(PERMISSIONS.PAYROLL_READ) ? (
        <section className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground-muted">Masse salariale — premier cycle brouillon</h2>
            <Link className="text-[11px] font-semibold text-accent hover:underline" to="/rh/paie/cycles">
              Ouvrir cycles paie
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-4 text-[12px]">
            <div>
              <div className="text-[10px] font-semibold uppercase text-foreground-muted">Brut Σ</div>
              <div className="font-mono text-[14px]">{data?.payrollTotalsDraft.gross ?? "…"}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase text-foreground-muted">Net Σ</div>
              <div className="font-mono text-[14px]">{data?.payrollTotalsDraft.net ?? "…"}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase text-foreground-muted">Récup. avances</div>
              <div className="font-mono text-[14px]">{data?.payrollTotalsDraft.advances ?? "…"}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase text-foreground-muted">Fiches</div>
              <div className="font-mono text-[14px]">{data?.payrollTotalsDraft.count ?? "…"}</div>
            </div>
          </div>
          {data?.payrollDraftCycles.length ? (
            <ul className="mt-3 space-y-1 text-[11px] text-foreground-muted">
              {data.payrollDraftCycles.map((c) => (
                <li key={c.id}>
                  {c.label || "Cycle"} · {c.periodStart.slice(0, 10)} → {c.periodEnd.slice(0, 10)}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-3">
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-foreground-muted">Activité employés (journal)</h2>
        {data?.recentWorkerActivity.length ? (
          <table className="w-full border-collapse text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase text-foreground-muted">
                <th className="py-1.5">Quand</th>
                <th className="py-1.5">Action</th>
                <th className="py-1.5">Opérateur</th>
              </tr>
            </thead>
            <tbody>
              {data.recentWorkerActivity.map((l) => (
                <tr key={l.id} className="border-b border-border/70">
                  <td className="py-1.5 font-mono text-[10px]">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="py-1.5">{l.action}</td>
                  <td className="py-1.5">{l.user?.displayName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[12px] text-foreground-muted">Pas encore d&apos;événements RH journalisés.</p>
        )}
      </section>
    </div>
  );
}
