import { IPC_CHANNELS } from "@shared/ipc-channels";
import type { IntegrityFinding } from "@shared/data-integrity-types";
import { PERMISSIONS } from "@shared/permissions";
import { Activity, FlaskConical, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";
import { useToastStore } from "@/stores/toast-store";

type QaOverview = {
  integrityHistory: Array<{
    checkedAt: string;
    ok: boolean;
    severityMax: string;
    findingCodes: string[];
  }>;
  lastDeploymentCert: {
    runAt: string;
    overallOk: boolean;
    checks: Array<{ id: string; ok: boolean; detail?: string }>;
  } | null;
  backupHealth: {
    lastBackupAt: string | null;
    lastIntegrityStatus: string | null;
    warningStale: boolean;
  } | null;
};

type IntegrityScan = {
  checkedAt: string;
  ok: boolean;
  findings: IntegrityFinding[];
};

export function QaDashboardPage() {
  const { can } = usePermissions();
  const toast = useToastStore((t) => t.push);
  const [overview, setOverview] = useState<QaOverview | null>(null);
  const [lastScan, setLastScan] = useState<IntegrityScan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can]);

  async function loadOverview(): Promise<void> {
    if (!can(PERMISSIONS.SETTINGS_READ)) return;
    try {
      const o = await samyInvoke<QaOverview>(IPC_CHANNELS.QA_OVERVIEW_GET);
      setOverview(o);
    } catch {
      setOverview(null);
    }
  }

  async function runIntegrity(): Promise<void> {
    setBusy("scan");
    try {
      const r = await samyInvoke<IntegrityScan>(IPC_CHANNELS.DB_DATA_INTEGRITY_SCAN);
      setLastScan(r);
      await loadOverview();
      toast(
        r.ok ? "success" : "error",
        r.ok ? "Scan métier terminé sans erreur critique." : "Blocages critiques ou erreurs détectées.",
      );
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function runDeployCert(): Promise<void> {
    setBusy("cert");
    try {
      const r = await samyInvoke<{ overallOk: boolean }>(IPC_CHANNELS.SYSTEM_DEPLOYMENT_CERT_RUN);
      await loadOverview();
      toast(
        r.overallOk ? "success" : "error",
        r.overallOk ? "Certification poste conforme." : "Ajuster dossier sauvegardes / stockage puis relancer.",
      );
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function exportDiag(): Promise<void> {
    setBusy("diag");
    try {
      const r = await samyInvoke<{ absolutePath: string }>(IPC_CHANNELS.SYSTEM_DIAGNOSTICS_EXPORT);
      toast("success", `Export diagnostics : ${r.absolutePath}`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!can(PERMISSIONS.SETTINGS_READ)) return <Navigate to="/" replace />;

  const history = overview?.integrityHistory.slice(-15).reverse() ?? [];

  return (
    <div className="flex flex-col gap-5" data-testid="qa-dashboard-page">
      <PageHeader
        title="Qualité interne — Phase 11"
        subtitle="Historique scans, certification poste, diagnostics offline."
        actions={
          <Link className="btn-secondary h-9 px-3 text-[12px] leading-9" to="/diagnostics">
            Diagnostics système
          </Link>
        }
      />

      <section className="erp-panel grid gap-3 p-4 md:grid-cols-4">
        <article className="border border-border bg-surface-muted/40 p-3">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <FlaskConical className="h-4 w-4 text-accent" aria-hidden />
            Intégrité métier
          </div>
          <p className="mt-2 text-[22px] font-black tabular-nums">
            {lastScan ? (lastScan.ok ? "PASS" : "FAIL") : "—"}
          </p>
          <p className="mt-1 text-[11px] text-foreground-muted">
            Dernier scan :{" "}
            <span className="font-mono">
              {lastScan?.checkedAt.slice(0, 19) ?? (history[0]?.checkedAt?.slice(0, 19) ?? "—")}
            </span>
          </p>
        </article>

        <article className="border border-border bg-surface-muted/40 p-3">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
            Certification poste
          </div>
          <p className="mt-2 text-[22px] font-black tabular-nums">
            {overview?.lastDeploymentCert
              ? overview.lastDeploymentCert.overallOk
                ? "PASS"
                : "REVOIR"
              : "—"}
          </p>
          <p className="mt-1 font-mono text-[10.5px] text-foreground-muted">
            {overview?.lastDeploymentCert?.runAt?.slice(0, 19) ?? "Pas encore"}
          </p>
        </article>

        <article className="border border-border bg-surface-muted/40 p-3">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <Activity className="h-4 w-4 text-accent" aria-hidden />
            Sauvegardes
          </div>
          <p className="mt-2 text-[13px] font-semibold">
            {overview?.backupHealth?.warningStale === true ? (
              <span className="text-danger"> TTL — attention</span>
            ) : overview?.backupHealth?.lastBackupAt ? (
              <span className="text-emerald-600">Récent</span>
            ) : (
              <span className="text-foreground-muted">—</span>
            )}
          </p>
          <p className="mt-2 text-[11px] leading-snug text-foreground-muted">
            Dernière :{" "}
            <span className="font-mono">{overview?.backupHealth?.lastBackupAt?.slice(0, 16) ?? "—"}</span>
          </p>
        </article>

        <article className="border border-border bg-surface-muted/40 p-3">
          <div className="text-[12px] font-semibold text-foreground">Actions</div>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              className="btn-primary h-9 px-3 text-[12px] disabled:opacity-50"
              disabled={busy !== null}
              data-testid="qa-run-scan"
              onClick={() => void runIntegrity()}
            >
              Scanner intégrité
            </button>
            <button
              type="button"
              className="btn-secondary h-9 px-3 text-[12px] disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => void runDeployCert()}
            >
              Certification
            </button>
            <button
              type="button"
              className="btn-secondary h-9 px-3 text-[12px] disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => void exportDiag()}
            >
              Export diagnostics
            </button>
          </div>
          {busy ? <p className="mt-2 text-[11px] text-foreground-muted">… {busy}</p> : null}
        </article>
      </section>

      <section className="erp-panel space-y-3 p-4">
        <h2 className="text-[13px] font-semibold">Historique scans (mémoire poste)</h2>
        {history.length === 0 ? (
          <p className="text-[12px] text-foreground-muted">Aucun historique encore.</p>
        ) : (
          <table className="w-full border-collapse border border-border text-[11px]">
            <thead className="bg-surface-muted/60">
              <tr>
                <th className="border border-border px-2 py-1 text-left font-semibold">Instant</th>
                <th className="border border-border px-2 py-1 text-left font-semibold">Statut synthèse</th>
                <th className="border border-border px-2 py-1 text-left font-semibold">Gravité max</th>
                <th className="border border-border px-2 py-1 text-left font-semibold">Codes</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row, i) => (
                <tr key={`${row.checkedAt}-${String(i)}`}>
                  <td className="border border-border px-2 py-1 font-mono">{row.checkedAt.slice(0, 19)}</td>
                  <td className="border border-border px-2 py-1">{row.ok ? "PASS" : "BLOCAGE"}</td>
                  <td className="border border-border px-2 py-1">{row.severityMax}</td>
                  <td className="border border-border px-2 py-1 font-mono text-[10px]">
                    {(row.findingCodes ?? []).slice(0, 6).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {lastScan && lastScan.findings.length > 0 ? (
        <section className="erp-panel space-y-2 p-4">
          <h2 className="text-[13px] font-semibold">Détail dernier scan</h2>
          <ul className="space-y-2 text-[12px] leading-snug">
            {lastScan.findings.slice(0, 24).map((f) => (
              <li key={f.code + (f.sampleIds?.[0] ?? "")} className="border border-border px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-2 font-mono text-[11px] font-bold text-accent">
                  {f.code}
                  <span className="text-foreground-muted">({f.severity})</span>
                </div>
                <p className="mt-1">{f.message}</p>
                {f.recommendation ? (
                  <p className="mt-1 border-l-2 border-accent/35 pl-2 text-[11px] text-foreground-muted">
                    {f.recommendation}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
