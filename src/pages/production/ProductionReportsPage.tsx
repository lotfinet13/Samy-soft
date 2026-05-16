import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadCsvUtf8 } from "@/lib/csv-download";
import { samyInvoke } from "@/lib/samy";

type ExportTask = {
  title: string;
  description: string;
  hint: string;
  filenamePrefix: string;
  channel:
    | typeof IPC_CHANNELS.PRODUCTION_REPORT_BATCHES_CSV
    | typeof IPC_CHANNELS.PRODUCTION_REPORT_CONSUMPTION_CSV
    | typeof IPC_CHANNELS.PRODUCTION_REPORT_COSTS_CSV
    | typeof IPC_CHANNELS.PRODUCTION_REPORT_WASTE_CSV;
};

const EXPORT_DEFINITIONS: ExportTask[] = [
  {
    title: "Historique lots",
    description: "Chronologie codes lot, statuts, volumes plan / réalisé, coût matières.",
    hint: "Prépare PDF/Excel via post-traitement — extraction CSV immédiate.",
    filenamePrefix: "production-lots",
    channel: IPC_CHANNELS.PRODUCTION_REPORT_BATCHES_CSV,
  },
  {
    title: "Consommations PRODUCTION_OUT",
    description: "Grand-livre des sorties matières liées aux clôtures de fabrication.",
    hint: "Δ signé + référence lot (UUID) — contrôle cohérence inventaire.",
    filenamePrefix: "production-consommations",
    channel: IPC_CHANNELS.PRODUCTION_REPORT_CONSUMPTION_CSV,
  },
  {
    title: "Coûts & snapshots",
    description: "Lots complétés : coût total MP, volume, coût unitaire figé, charges optionnelles.",
    hint: "Colonne JSON métadonnées pour analytics marges futures.",
    filenamePrefix: "production-couts",
    channel: IPC_CHANNELS.PRODUCTION_REPORT_COSTS_CSV,
  },
  {
    title: "Pertes & avaries",
    description: "Mouvements PRODUCTION_WASTE et DAMAGED_LOSS sur matières premières.",
    hint: "Analyse gaspillage par SKU et par instant.",
    filenamePrefix: "production-dechets",
    channel: IPC_CHANNELS.PRODUCTION_REPORT_WASTE_CSV,
  },
];

export function ProductionReportsPage() {
  const { can } = usePermissions();
  const canRead = can(PERMISSIONS.PRODUCTION_READ);
  const canReport = can(PERMISSIONS.PRODUCTION_REPORT);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stamp = useMemo(() => new Date().toISOString().slice(0, 10), []);

  if (!canRead) return <Navigate to="/" replace />;
  if (!canReport) return <Navigate to="/production/centre" replace />;

  async function handleExport(task: ExportTask): Promise<void> {
    setBusyKey(task.channel);
    setError(null);
    try {
      const res = await samyInvoke<{ csv: string }>(task.channel);
      downloadCsvUtf8(`${task.filenamePrefix}-${stamp}.csv`, res.csv);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Extractions production"
        subtitle="Exports CSV alignés poste usine — PDF/Excel via pipeline externe."
      />

      {error ? <div className="border border-danger/70 bg-danger/10 px-3 py-2 text-[12px] font-semibold text-danger">{error}</div> : null}

      <section className="grid gap-3 md:grid-cols-2">
        {EXPORT_DEFINITIONS.map((task) => (
          <article key={task.channel} className="flex flex-col gap-2 border border-border bg-surface-muted/35 p-3">
            <div>
              <h3 className="text-[13px] font-semibold">{task.title}</h3>
              <p className="mt-1 text-[11.5px] text-foreground-muted">{task.description}</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">{task.hint}</p>
            </div>
            <button
              type="button"
              disabled={busyKey === task.channel}
              className="mt-auto self-start border border-accent bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-foreground disabled:opacity-50"
              onClick={() => handleExport(task).catch(console.error)}
            >
              {busyKey === task.channel ? "…" : "Télécharger CSV"}
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
