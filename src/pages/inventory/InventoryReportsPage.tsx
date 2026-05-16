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
    | typeof IPC_CHANNELS.INVENTORY_REPORT_VALUATION
    | typeof IPC_CHANNELS.INVENTORY_REPORT_MOVEMENTS_EXPORT
    | typeof IPC_CHANNELS.INVENTORY_REPORT_PURCHASE_EXPORT
    | typeof IPC_CHANNELS.INVENTORY_REPORT_LOW_STOCK_EXPORT
    | typeof IPC_CHANNELS.INVENTORY_REPORT_EXPIRATION_EXPORT;
};

const EXPORT_DEFINITIONS: ExportTask[] = [
  {
    title: "Valorisation physique",
    description: "Synthèse des quantités x coûts unitaires (matières + emballages).",
    hint: "Format CSV français (Excel) — BOM UTF-8 automatique.",
    filenamePrefix: "valorisation-stock",
    channel: IPC_CHANNELS.INVENTORY_REPORT_VALUATION,
  },
  {
    title: "Grand-livre mouvements",
    description: "Extractions mouvements (horodatage, delta net, références).",
    hint: "Limiter à 5000 lignes chronologiques côté IPC.",
    filenamePrefix: "mouvements-stock",
    channel: IPC_CHANNELS.INVENTORY_REPORT_MOVEMENTS_EXPORT,
  },
  {
    title: "Achats ligné",
    description: "Détail bons acheteurs (facture, SKU figé snapshot, lignes multiples).",
    hint: "Jusqu’à ~2500 bons — export analytique acheteurs.",
    filenamePrefix: "achats-lignes",
    channel: IPC_CHANNELS.INVENTORY_REPORT_PURCHASE_EXPORT,
  },
  {
    title: "Stocks critiques",
    description: "Seuils industriels avec quantités physiques agrégées au jour J.",
    hint: "Matières + emballages actifs sous minimum.",
    filenamePrefix: "alertes-stock-bas",
    channel: IPC_CHANNELS.INVENTORY_REPORT_LOW_STOCK_EXPORT,
  },
  {
    title: "Péremption / DLC entrées",
    description: "Mouvements PURCHASE_IN avec DLC / traçabilité.",
    hint: "Tri imminent → plus éloigné.",
    filenamePrefix: "expiration-entrees",
    channel: IPC_CHANNELS.INVENTORY_REPORT_EXPIRATION_EXPORT,
  },
];

export function InventoryReportsPage() {
  const { can } = usePermissions();
  const canRead = can(PERMISSIONS.INVENTORY_READ);
  const canReport = can(PERMISSIONS.INVENTORY_REPORT);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stamp = useMemo(() => new Date().toISOString().slice(0, 10), []);

  if (!canRead) return <Navigate to="/" replace />;
  if (!canReport) return <Navigate to="/inventaire/tableau-de-bord" replace />;

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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Exports analytiques stocks"
        subtitle="Conformité industrielle CSV — séparation stricte des permissions lecture / rapport & audit."
      />

      {error ? (
        <div className="border border-danger/70 bg-danger/10 px-3 py-2 text-[12px] font-semibold text-danger">{error}</div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        {EXPORT_DEFINITIONS.map((task) => (
          <article key={task.channel} className="flex flex-col gap-3 border border-border bg-surface-muted/35 p-4">
            <div>
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-accent">{task.title}</h2>
              <p className="mt-2 text-[12px] leading-snug text-foreground-muted">{task.description}</p>
              <p className="mt-2 border border-border/60 bg-surface-muted/60 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-foreground-muted">
                {task.hint}
              </p>
            </div>
            <button
              type="button"
              disabled={busyKey !== null}
              className="focus-ring mt-auto border border-accent bg-accent px-4 py-2 text-[12px] font-semibold text-accent-foreground hover:opacity-95 disabled:cursor-progress disabled:opacity-60"
              onClick={() => void handleExport(task)}
            >
              {busyKey === task.channel ? "Génération…" : `Télécharger ${task.filenamePrefix}.csv`}
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
