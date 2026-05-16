import { IPC_CHANNELS } from "@shared/ipc-channels";
import type { IntegrityFinding } from "@shared/data-integrity-types";
import { PERMISSIONS } from "@shared/permissions";
import { Activity, Database, HardDrive, Server, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";
import type { WorkstationInfoDTO } from "@/types/ipc";
import { useToastStore } from "@/stores/toast-store";

type MaintSummary = {
  integrityOk: boolean;
  integrityPreview: string[];
  pragmas: unknown;
  foreignKeyIssues: Array<Record<string, unknown>>;
  migrations: Array<{ name: string; finishedAt?: string | null }>;
  rowApprox: Record<string, number>;
  sqlite: { absolutePath: string; exists: boolean; sizeBytes?: number };
};

type BackupHealth = {
  lastBackupAt: string | null;
  lastIntegrityStatus: string | null;
  warningStale: boolean;
};

type IntegrityReport = {
  checkedAt: string;
  ok: boolean;
  findings: IntegrityFinding[];
};

export function SystemHealthPage() {
  const { can } = usePermissions();
  const toast = useToastStore((t) => t.push);
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [workstation, setWorkstation] = useState<WorkstationInfoDTO | null>(null);
  const [maint, setMaint] = useState<MaintSummary | null>(null);
  const [backup, setBackup] = useState<BackupHealth | null>(null);
  const [scan, setScan] = useState<IntegrityReport | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [maintBusy, setMaintBusy] = useState(false);

  useEffect(() => {
    void samyInvoke<WorkstationInfoDTO>(IPC_CHANNELS.APP_WORKSTATION_INFO).then(setWorkstation).catch(() => setWorkstation(null));
  }, []);

  useEffect(() => {
    if (!can(PERMISSIONS.SETTINGS_READ)) return;
    void (async () => {
      try {
        await samyInvoke(IPC_CHANNELS.DB_HEALTH);
        setDbOk(true);
      } catch {
        setDbOk(false);
      }
    })();
  }, [can]);

  useEffect(() => {
    if (!can(PERMISSIONS.SETTINGS_READ)) return;
    void (async () => {
      try {
        const h = await samyInvoke<BackupHealth>(IPC_CHANNELS.BACKUP_HEALTH);
        setBackup(h);
      } catch {
        setBackup(null);
      }
    })();
  }, [can]);

  async function loadMaint(): Promise<void> {
    if (!can(PERMISSIONS.SETTINGS_READ)) return;
    setMaintBusy(true);
    try {
      const m = await samyInvoke<MaintSummary>(IPC_CHANNELS.DB_MAINT_SUMMARY);
      setMaint(m);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setMaintBusy(false);
    }
  }

  useEffect(() => {
    void loadMaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can]);

  async function runScan(): Promise<void> {
    if (!can(PERMISSIONS.SETTINGS_READ)) return;
    setScanBusy(true);
    try {
      const r = await samyInvoke<IntegrityReport>(IPC_CHANNELS.DB_DATA_INTEGRITY_SCAN);
      setScan(r);
      toast(r.ok ? "success" : "error", r.ok ? "Scan métier OK." : "Anomalies détectées — consulter le détail.");
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setScanBusy(false);
    }
  }

  if (!can(PERMISSIONS.SETTINGS_READ)) return <Navigate to="/" replace />;

  const readiness = [
    { label: "Connexion SQLite", ok: dbOk === true },
    { label: "PRAGMA intégrité", ok: maint?.integrityOk === true },
    { label: "Clés étrangères", ok: (maint?.foreignKeyIssues?.length ?? 0) === 0 },
    { label: "Sauvegarde récente", ok: backup ? !backup.warningStale : false },
    { label: "Scan métier", ok: scan ? scan.ok : null as boolean | null },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Diagnostics & santé système"
        subtitle="Lecture seule + actions maintenance — réservé profils paramètres."
        actions={
          <Link className="btn-secondary h-9 px-3 text-[12px] leading-9" to="/parametres">
            Paramètres
          </Link>
        }
      />

      <section className="erp-panel grid gap-3 p-4 lg:grid-cols-3">
        <article className="flex flex-col gap-2 border border-border bg-surface-muted/40 p-3">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <Database className="h-4 w-4 text-accent" aria-hidden />
            Base de données
          </div>
          <p className="text-[11.5px] text-foreground-muted">
            Heartbeat <code className="font-mono text-[10.5px]">SELECT 1</code> — état opérationnel poste.
          </p>
          <div className="font-mono text-[13px]">{dbOk === null ? "…" : dbOk ? "OK" : "Incident"}</div>
        </article>
        <article className="flex flex-col gap-2 border border-border bg-surface-muted/40 p-3">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <HardDrive className="h-4 w-4 text-accent" aria-hidden />
            Sauvegardes
          </div>
          <ul className="space-y-1 text-[11.5px] text-foreground-muted">
            <li>Dernière : {backup?.lastBackupAt ? backup.lastBackupAt.slice(0, 19) : "—"}</li>
            <li>Intégrité archive : {backup?.lastIntegrityStatus ?? "—"}</li>
            <li className={backup?.warningStale ? "text-danger font-semibold" : ""}>
              {backup?.warningStale ? "Attention : sauvegarde périmée" : "Politique TTL respectée"}
            </li>
          </ul>
        </article>
        <article className="flex flex-col gap-2 border border-border bg-surface-muted/40 p-3">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <Server className="h-4 w-4 text-accent" aria-hidden />
            Poste & build
          </div>
          <dl className="space-y-1 text-[11.5px]">
            <div className="flex justify-between gap-2">
              <dt className="text-foreground-muted">Hôte</dt>
              <dd className="font-mono">{workstation?.hostname ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-foreground-muted">Version</dt>
              <dd className="font-mono">{workstation?.version ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-foreground-muted">Plateforme</dt>
              <dd className="font-mono">{workstation?.platform ?? "—"}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="erp-panel space-y-3 p-4">
        <header className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <ShieldCheck className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="text-[13px] font-semibold">Prêt production</h2>
        </header>
        <ul className="grid gap-2 md:grid-cols-2">
          {readiness.map((r) => (
            <li
              key={r.label}
              className="flex items-center justify-between border border-border bg-surface-muted/30 px-3 py-2 text-[11.5px]"
            >
              <span>{r.label}</span>
              <span className="font-mono font-semibold">
                {r.ok === null ? "…" : r.ok ? "OK" : "À traiter"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="erp-panel space-y-3 p-4">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="text-[13px] font-semibold">Maintenance SQLite & stockage</h2>
          </div>
          <button type="button" className="btn-secondary h-8 px-3 text-[11px]" disabled={maintBusy} onClick={() => void loadMaint()}>
            {maintBusy ? "…" : "Rafraîchir synthèse"}
          </button>
        </header>
        {maint ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 text-[11.5px]">
              <div className="font-semibold">PRAGMA (extrait)</div>
              <pre className="max-h-[180px] overflow-auto rounded border border-border bg-surface-muted/50 p-2 font-mono text-[10.5px]">
                {(maint.integrityPreview ?? []).join("\n")}
              </pre>
              <div className="text-foreground-muted">FK en violation : {maint.foreignKeyIssues?.length ?? 0}</div>
              {maint.sqlite?.exists ? (
                <div className="text-foreground-muted">
                  Fichier :{" "}
                  <span className="break-all font-mono text-foreground">{maint.sqlite.absolutePath}</span>
                </div>
              ) : (
                <div className="text-danger font-semibold">Fichier base introuvable sur ce poste.</div>
              )}
              {maint.sqlite?.sizeBytes != null ? (
                <div className="font-mono">Taille {(maint.sqlite.sizeBytes / (1024 * 1024)).toFixed(2)} Mo</div>
              ) : null}
            </div>
            <div className="space-y-2 text-[11.5px]">
              <div className="font-semibold">Volumes approximatifs</div>
              <ul className="max-h-[200px] space-y-1 overflow-auto rounded border border-border px-2 py-1">
                {Object.entries(maint.rowApprox ?? {}).map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-4 font-mono text-[11px]">
                    <span className="truncate">{k}</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-foreground-muted">Chargement synthèse…</p>
        )}
      </section>

      <section className="erp-panel space-y-3 p-4">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <h2 className="text-[13px] font-semibold">Contrôle métier (lecture seule)</h2>
          <button type="button" className="btn-primary h-8 px-3 text-[11px]" disabled={scanBusy} onClick={() => void runScan()}>
            {scanBusy ? "Analyse…" : "Lancer scan"}
          </button>
        </header>
        {scan ? (
          <div className="space-y-2 text-[11.5px]">
            <div className="font-mono text-[11px] text-foreground-muted">{scan.checkedAt}</div>
            <div className={scan.ok ? "text-accent" : "text-danger"}>{scan.ok ? "Aucune anomalie bloquante." : "Anomalies signalées."}</div>
            <ul className="space-y-1">
              {scan.findings.map((f) => (
                <li key={`${f.code}-${f.message}`} className="rounded border border-border px-2 py-1">
                  <span className="font-semibold">{f.severity.toUpperCase()}</span> · {f.code} — {f.message}
                  {f.count != null ? <span className="font-mono"> ×{f.count}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[12px] text-foreground-muted">Aucun scan sur cette session — lancez-le avant une campagne industrielle.</p>
        )}
      </section>
    </div>
  );
}
