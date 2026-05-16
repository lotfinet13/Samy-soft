import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

type WorkerRow = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  department: string | null;
  jobTitle: string | null;
  isActive: boolean;
  salaryType: string;
};

export function HrWorkersPage() {
  const { can } = usePermissions();
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [rows, setRows] = useState<WorkerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await samyInvoke<{ items: WorkerRow[]; total: number }>(IPC_CHANNELS.HR_WORKER_LIST, {
          q: q.trim() || undefined,
          department: deptFilter.trim() || undefined,
          take: 250,
        });
        setRows(res.items);
        setTotal(res.total);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [q, deptFilter]);

  if (!can(PERMISSIONS.HR_READ)) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Effectifs" subtitle="Recherche rapide, filtres compacts — accès fiche et historique paie." />

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="erp-input h-8 max-w-xs text-[12px]"
          placeholder="Recherche code, nom, tél…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className="erp-input h-8 max-w-[140px] text-[12px]"
          placeholder="Département"
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          title="Filtre service / département"
        />
        <span className="text-[11px] text-foreground-muted">{total} résultat(s)</span>
        {can(PERMISSIONS.HR_WRITE) ? (
          <Link
            to="/rh/effectifs/nouveau"
            className="ml-auto rounded border border-accent bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/20"
          >
            + Nouvel employé
          </Link>
        ) : null}
      </div>

      {error ? (
        <p className="rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[12px] text-danger">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-[var(--erp-radius-panel)] border border-border bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-border bg-surface-muted/50 text-[10.5px] font-semibold uppercase text-foreground-muted">
              <th className="px-2 py-1.5">Code</th>
              <th className="px-2 py-1.5">Nom</th>
              <th className="px-2 py-1.5">Poste</th>
              <th className="px-2 py-1.5">Dépt.</th>
              <th className="px-2 py-1.5">Contrat</th>
              <th className="px-2 py-1.5">Actif</th>
              <th className="px-2 py-1.5 text-right">Fiche</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="border-b border-border/70 hover:bg-surface-elevated/60">
                <td className="px-2 py-1 font-mono text-[11px]">{w.code}</td>
                <td className="px-2 py-1 font-semibold">
                  {w.lastName.toUpperCase()} {w.firstName}
                </td>
                <td className="px-2 py-1 text-foreground-muted">{w.jobTitle ?? "—"}</td>
                <td className="px-2 py-1 text-foreground-muted">{w.department ?? "—"}</td>
                <td className="px-2 py-1 font-mono text-[11px]">{w.salaryType}</td>
                <td className="px-2 py-1">{w.isActive ? "oui" : "non"}</td>
                <td className="px-2 py-1 text-right">
                  <Link className="text-accent hover:underline" to={`/rh/effectifs/${w.id}`}>
                    Ouvrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
