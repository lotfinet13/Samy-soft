import { IPC_CHANNELS } from "@shared/ipc-channels";
import type { ReactNode } from "react";
import { AsyncStatePanel } from "@/components/system/AsyncStatePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { useAsyncLoad } from "@/hooks/useAsyncLoad";
import { samyInvoke } from "@/lib/samy";

type Summary = {
  totals: {
    inventoryValueSerialized: string;
    recordedPurchasesSerialized: string;
  };
  lowStock: Array<{
    sku: string;
    label: string;
    currentQtySerialized: string;
    thresholdSerialized: string;
  }>;
  expiringSoon: Array<unknown>;
  latestPurchases: Array<{ id: string; supplierName: string; totalSerialized: string; invoiceRef?: string | null }>;
  latestMovements: Array<{ inventoryKind?: string; materialLabel?: string; qtySignedSerialized?: string }>;
  suppliers: Array<{ name: string; purchases: number }>;
};

export function InventoryDashboardPage() {
  const { data, loading, error, reload } = useAsyncLoad(
    () => samyInvoke<Summary>(IPC_CHANNELS.INVENTORY_DASHBOARD_SUMMARY),
    [],
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Pilotage stocks" subtitle="Vue opérationnelle — valorisation agrégée, alertes locales, derniers mouvements." />

      <AsyncStatePanel loading={loading} error={error} onRetry={() => void reload()}>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Valorisation physique" value={data?.totals.inventoryValueSerialized ?? "…"} hint="Σ qté × coût moy." />
        <StatCard label="Achats cumulés" value={data?.totals.recordedPurchasesSerialized ?? "…"} hint="Somme bons entrée" />
        <StatCard label="Alertes stock bas" value={String(data?.lowStock.length ?? 0)} tone="warning" hint="Au seuil configuré" />
        <StatCard label="Lots expirant (45 j.)" value={String(data?.expiringSoon.length ?? 0)} hint="Réception avec DLC" />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <InventoryPanel title="Stock critique">
          {data?.lowStock?.length ? (
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-[10.5px] font-semibold uppercase text-foreground-muted">
                  <th className="py-2">SKU</th>
                  <th className="py-2">Article</th>
                  <th className="py-2 text-right">Réel</th>
                  <th className="py-2 text-right">Seuil</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((row) => (
                  <tr key={row.sku} className="border-b border-border/70">
                    <td className="py-2 font-mono">{row.sku}</td>
                    <td className="py-2">{row.label}</td>
                    <td className="py-2 text-right font-mono text-danger">{row.currentQtySerialized}</td>
                    <td className="py-2 text-right font-mono text-foreground-muted">{row.thresholdSerialized}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[12px] text-foreground-muted">Aucune alerte critique.</p>
          )}
        </InventoryPanel>

        <InventoryPanel title="Dernières réceptions">
          {data?.latestPurchases?.length ? (
            <ul className="space-y-2 text-[12px]">
              {data.latestPurchases.map((p) => (
                <li key={p.id} className="flex justify-between gap-4 border border-border px-3 py-2">
                  <div>
                    <div className="font-semibold text-foreground">{p.supplierName}</div>
                    <div className="text-[11px] text-foreground-muted">{p.invoiceRef || "sans facture"}</div>
                  </div>
                  <div className="font-mono text-accent">{p.totalSerialized}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-foreground-muted">Aucun achat encore saisi.</p>
          )}
        </InventoryPanel>
      </section>

      <InventoryPanel title="Mouvements récents">
        {data?.latestMovements?.length ? (
          <table className="w-full border-collapse text-left text-[11.8px]">
            <thead>
              <tr className="border-b border-border text-[10.5px] font-semibold uppercase text-foreground-muted">
                <th className="py-2">Type</th>
                <th className="py-2">Article</th>
                <th className="py-2 text-right">Δ qté</th>
              </tr>
            </thead>
            <tbody>
              {data.latestMovements.map((m, idx) => (
                <tr key={`${m.inventoryKind ?? ""}-${idx}`} className="border-b border-border/60">
                  <td className="py-1.5">{m.inventoryKind}</td>
                  <td className="py-1.5">{m.materialLabel}</td>
                  <td className="py-1.5 text-right font-mono">{m.qtySignedSerialized}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[12px] text-foreground-muted">Aucun mouvement enregistré.</p>
        )}
      </InventoryPanel>
      </AsyncStatePanel>
    </div>
  );
}

function InventoryPanel(props: { title: string; children: ReactNode }) {
  return (
    <section className="border border-border bg-surface-elevated shadow-inner">
      <header className="border-b border-border px-3 py-2 text-[12px] font-semibold text-foreground">{props.title}</header>
      <div className="p-3">{props.children}</div>
    </section>
  );
}
