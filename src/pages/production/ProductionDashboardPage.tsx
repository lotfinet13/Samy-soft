import { IPC_CHANNELS } from "@shared/ipc-channels";
import type { ReactNode } from "react";
import { AsyncStatePanel } from "@/components/system/AsyncStatePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { useAsyncLoad } from "@/hooks/useAsyncLoad";
import { samyInvoke } from "@/lib/samy";

type Summary = {
  activeBatches: number;
  throughputTodaySerialized: string;
  runningPanels: Array<{ code: string; recipe: string; status: string; plannedQtySerialized: string; assignee: string }>;
  latestCompleted: Array<{ code: string; recipe: string; producedQtySerialized: string; ingredientCostSerialized: string; finishedAt: string | null }>;
  wasteAlerts: Array<{ sku: string; qtySignedSerialized: string; occurredIso: string; note: string }>;
};

export function ProductionDashboardPage() {
  const { data, loading, error, reload } = useAsyncLoad(
    () => samyInvoke<Summary>(IPC_CHANNELS.PRODUCTION_DASHBOARD_SUMMARY),
    [],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="production-dashboard-page">
      <PageHeader
        title="Poste commanderie fabrication"
        subtitle="Orchestration recettes ⇄ lots ⇄ mouvements PRODUCTION_OUT — aucune rupture hors grand-livre."
      />

      <AsyncStatePanel loading={loading} error={error} onRetry={() => void reload()}>
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          hint="Lots planifiés / en cours"
          label="Dossiers fabrication actifs"
          tone="warning"
          value={String(data?.activeBatches ?? "…")}
        />
        <StatCard
          hint="Σ volumes cloturés aujourd’hui"
          label="Throughput journalier"
          value={data?.throughputTodaySerialized ?? "…"}
        />
        <StatCard
          hint="Mouvements PRODUCTION_WASTE horodatés"
          label="Alertes déchets atelier"
          tone="warning"
          value={String(data?.wasteAlerts?.length ?? 0)}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Rails logistiques (lots vivants)">
          {data?.runningPanels?.length ? (
            <table className="w-full border-collapse text-left text-[11.8px]">
              <thead className="text-[10px] font-semibold uppercase text-foreground-muted">
                <tr className="border-b border-border">
                  <th className="pb-2">Lot</th>
                  <th className="pb-2">Recette</th>
                  <th className="pb-2">Statut</th>
                  <th className="pb-2 text-right">Planifié</th>
                  <th className="pb-2 text-right">Pilote</th>
                </tr>
              </thead>
              <tbody>
                {data.runningPanels.map((row) => (
                  <tr key={row.code} className="border-b border-border/60">
                    <td className="py-1.5 font-mono text-accent">{row.code}</td>
                    <td className="py-1.5">{row.recipe}</td>
                    <td className="py-1.5 text-[11px] font-semibold">{row.status}</td>
                    <td className="py-1.5 text-right font-mono">{row.plannedQtySerialized}</td>
                    <td className="py-1.5 text-right text-[11px] text-foreground-muted">{row.assignee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[12px] text-foreground-muted">Aucun lot actif détecté sur ce périmètre.</p>
          )}
        </Panel>

        <Panel title="Derniers dossiers cloturés">
          {data?.latestCompleted?.length ? (
            <ul className="space-y-2 text-[11.8px]">
              {data.latestCompleted.map((row) => (
                <li key={row.code} className="border border-border px-3 py-2">
                  <div className="flex justify-between gap-4">
                    <div>
                      <div className="font-mono text-accent">{row.code}</div>
                      <div className="text-[11px] text-foreground-muted">{row.recipe}</div>
                    </div>
                    <div className="text-right font-mono text-[11px]">
                      <div>Qté {row.producedQtySerialized}</div>
                      <div>MP {row.ingredientCostSerialized}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-foreground-muted">Pas encore de clôtures sur ce créneau.</p>
          )}
        </Panel>
      </section>

      <Panel title="Radar déchets (PRODUCTION_WASTE / mouvements)">
        <div className="max-h-48 overflow-auto">
          {data?.wasteAlerts?.length ? (
            <table className="w-full border-collapse text-[11px]">
              <thead className="text-[10px] font-semibold uppercase text-foreground-muted">
                <tr className="border-b border-border">
                  <th className="pb-2 text-left">SKU</th>
                  <th className="pb-2 text-right">Δ</th>
                  <th className="pb-2 text-right">Instant</th>
                </tr>
              </thead>
              <tbody>
                {data.wasteAlerts.map((row, idx) => (
                  <tr key={`${row.sku}-${idx}`} className="border-b border-border/70">
                    <td className="py-1.5 font-mono">{row.sku}</td>
                    <td className="py-1.5 text-right font-mono text-danger">{row.qtySignedSerialized}</td>
                    <td className="py-1.5 text-right text-foreground-muted">{row.occurredIso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[12px] text-foreground-muted">Aucune alerte déchet urgente dans la fenêtre de contrôle.</p>
          )}
        </div>
      </Panel>
      </AsyncStatePanel>
    </div>
  );
}

function Panel(props: { title: string; children: ReactNode }) {
  return (
    <section className="border border-border bg-surface-elevated shadow-inner">
      <header className="border-b border-border px-3 py-2 text-[12px] font-semibold">{props.title}</header>
      <div className="p-3">{props.children}</div>
    </section>
  );
}
