import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";
import { Link } from "react-router-dom";
import { AsyncStatePanel } from "@/components/system/AsyncStatePanel";
import { useAsyncLoad } from "@/hooks/useAsyncLoad";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { invoiceStatusLabels, paymentMethodLabels, paymentStatusLabels } from "./sales-labels";

type Dash = {
  todayRevenueSerialized: string;
  unpaidInvoiceCount: number;
  recentInvoices: Array<{
    id: string;
    number: string;
    status: string;
    paymentStatus: string;
    issuedAt: string;
    totalAmountSerialized: string;
    customer: { code: string; name: string };
  }>;
  trend14d: Array<{ date: string; revenueSerialized: string }>;
  topCustomers: Array<{
    customerId: string;
    customer: { code: string; name: string };
    revenueSerialized: string;
  }>;
  paymentSummary: Array<{ method: string; sumSerialized: string }>;
  lowStockAlerts: Array<{ sku: string; name: string; qtySerialized: string }>;
};

export function SalesDashboardPage() {
  const { can } = usePermissions();
  const { data: dash, loading, error, reload } = useAsyncLoad(
    () => samyInvoke<Dash>(IPC_CHANNELS.SALES_DASHBOARD_SUMMARY),
    [],
  );

  const chartData =
    dash?.trend14d.map((t) => ({
      date: t.date.slice(5),
      revenue: Number.parseFloat(t.revenueSerialized.replace(",", ".")) || 0,
    })) ?? [];

  return (
    <div className="flex flex-col gap-4" data-testid="sales-dashboard-page">
      <PageHeader
        title="Centre commercial"
        subtitle="CA du jour, impayés, tendances 14 jours et alertes stock articles vendables."
      />

      {!can(PERMISSIONS.SALES_READ) ? (
        <p className="text-[12px] text-danger">Permission sales.read requise.</p>
      ) : null}

      <AsyncStatePanel loading={loading} error={error} onRetry={() => void reload()}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="CA aujourd’hui (validé / payé)"
          value={dash?.todayRevenueSerialized ?? "—"}
          hint="Factures émises ce jour, hors brouillon."
        />
        <StatCard
          label="Factures impayées"
          value={dash ? String(dash.unpaidInvoiceCount) : "—"}
          hint="Validées, solde résiduel."
        />
        <StatCard
          label="Clients top (14 j)"
          value={dash?.topCustomers[0]?.customer.name ?? "—"}
          hint={dash?.topCustomers[0] ? `${dash.topCustomers[0].revenueSerialized} DZD` : undefined}
        />
        <StatCard
          label="Alertes stock catalogue"
          value={dash ? String(dash.lowStockAlerts.length) : "—"}
          hint="Produits actifs sous seuil minimum."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="erp-panel xl:col-span-2">
          <header className="border-b border-border px-3 py-2">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground-muted">
              Tendance CA (14 jours)
            </h2>
          </header>
          <div className="h-[220px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={44} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(0)}`, "CA"]} />
                <Line type="monotone" dataKey="revenue" stroke="rgb(var(--color-accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="erp-panel">
          <header className="border-b border-border px-3 py-2">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground-muted">
              Paiements (14 j)
            </h2>
          </header>
          <ul className="max-h-[240px] divide-y divide-border overflow-auto text-[12px]">
            {(dash?.paymentSummary ?? []).map((p) => (
              <li key={p.method} className="flex justify-between px-3 py-2">
                <span>{paymentMethodLabels[p.method] ?? p.method}</span>
                <span className="font-mono font-semibold">{p.sumSerialized}</span>
              </li>
            ))}
            {!dash?.paymentSummary.length ? (
              <li className="px-3 py-4 text-foreground-muted">Aucun encaissement.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="erp-panel">
          <header className="border-b border-border px-3 py-2">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground-muted">
              Factures récentes
            </h2>
          </header>
          <div className="overflow-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="text-left">N°</th>
                  <th className="text-left">Client</th>
                  <th className="text-right">TTC</th>
                  <th className="text-left">Statut</th>
                </tr>
              </thead>
              <tbody>
                {(dash?.recentInvoices ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-[11px]">
                      <Link className="text-accent hover:underline" to={`/ventes/factures/${r.id}`}>
                        {r.number}
                      </Link>
                    </td>
                    <td className="max-w-[140px] truncate">{r.customer.name}</td>
                    <td className="text-right font-mono">{r.totalAmountSerialized}</td>
                    <td className="text-[11px]">
                      {invoiceStatusLabels[r.status] ?? r.status} · {paymentStatusLabels[r.paymentStatus] ?? r.paymentStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="erp-panel">
          <header className="border-b border-border px-3 py-2">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground-muted">
              Stocks bas (catalogue)
            </h2>
          </header>
          <ul className="max-h-[260px] divide-y divide-border overflow-auto text-[12px]">
            {(dash?.lowStockAlerts ?? []).map((a) => (
              <li key={a.sku} className="flex justify-between px-3 py-2">
                <span className="min-w-0 truncate">
                  <span className="font-mono">{a.sku}</span> · {a.name}
                </span>
                <span className="shrink-0 font-mono text-warning">{a.qtySerialized}</span>
              </li>
            ))}
            {!dash?.lowStockAlerts.length ? (
              <li className="px-3 py-4 text-foreground-muted">Aucune alerte.</li>
            ) : null}
          </ul>
        </section>
      </div>
      </AsyncStatePanel>
    </div>
  );
}
