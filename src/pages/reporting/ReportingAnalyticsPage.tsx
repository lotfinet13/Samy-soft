import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useMemo, useState, type ReactNode } from "react";
import { AsyncStatePanel } from "@/components/system/AsyncStatePanel";
import { useAsyncLoad } from "@/hooks/useAsyncLoad";
import { Navigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

function isoRange(): { from: string; to: string } {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 2);
  return { from: start.toISOString(), to: end.toISOString() };
}

type InvAn = {
  purchaseValueWeekly: Array<{ week: string; amount: number }>;
  expiryLossWeekly: Array<{ week: string; qty: number; valueEstimate: number }>;
  supplierDependency: Array<{ supplierName: string; purchaseValue: number; pct: number }>;
  inboundValueApprox: number;
};

type PrdAn = {
  wasteTrendWeekly: Array<{ week: string; qty: number }>;
  operatorProductivity: Array<{ runtimeMinutes: number; operatorName: string; sessions: number }>;
};

type HrAn = {
  attendanceStatusWeekly: Array<{ week: string; presentOrEquivalent: number; absentEquivalent: number }>;
  overtimeMonthlyHours: Array<{ month: string; hours: number }>;
  payrollNetMonthly: Array<{ month: string; netAmount: number }>;
};

type SlAn = {
  revenueWeekly: Array<{ week: string; revenue: number }>;
  topProducts: Array<{ name: string; revenue: number; sku?: string }>;
  unpaidSnapshot: { outstandingEstimated: number; unpaidCount: number; partialCount: number };
};

export function ReportingAnalyticsPage() {
  const { can } = usePermissions();
  const [from, setFrom] = useState(() => isoRange().from.slice(0, 10));
  const [to, setTo] = useState(() => isoRange().to.slice(0, 10));

  const rangePayload = useMemo(
    () => ({
      from: new Date(`${from}T00:00:00.000Z`).toISOString(),
      to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    }),
    [from, to],
  );

  const { data, loading, error, reload } = useAsyncLoad(
    async () => {
      const [inv, prd, hr, sl] = await Promise.all([
        samyInvoke<InvAn>(IPC_CHANNELS.REPORTS_ANALYTICS_INVENTORY, rangePayload),
        samyInvoke<PrdAn>(IPC_CHANNELS.REPORTS_ANALYTICS_PRODUCTION, rangePayload),
        samyInvoke<HrAn>(IPC_CHANNELS.REPORTS_ANALYTICS_HR, rangePayload),
        samyInvoke<SlAn>(IPC_CHANNELS.REPORTS_ANALYTICS_SALES, rangePayload),
      ]);
      return { inv, prd, hr, sl };
    },
    [rangePayload.from, rangePayload.to],
    { immediate: can(PERMISSIONS.ANALYTICS_READ), timeoutMs: 90_000 },
  );
  const inv = data?.inv ?? null;
  const prd = data?.prd ?? null;
  const hr = data?.hr ?? null;
  const sl = data?.sl ?? null;

  if (!can(PERMISSIONS.ANALYTICS_READ)) return <Navigate to="/rapports" replace />;

  return (
    <div className="flex flex-col gap-4 pb-10">
      <PageHeader title="Analytiques inter-modules" subtitle="Indicateurs d’atelier densifiés sans effet tableau de démo SaaS." />

      <section className="erp-panel flex flex-wrap items-end gap-3 p-4 text-[13px]">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Du
          <input type="date" className="control-chrome h-9 px-2" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Au
          <input type="date" className="control-chrome h-9 px-2" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button
          type="button"
          className="control-chrome h-9 px-4 text-[12px] font-semibold disabled:opacity-50"
          disabled={loading}
          onClick={() => void reload()}
        >
          {loading ? "Calcul…" : "Recalculer"}
        </button>
      </section>

      <AsyncStatePanel loading={loading} error={error} onRetry={() => void reload()} loadingLabel="Agrégation des analytiques…">
      <div className="grid gap-3 xl:grid-cols-2">
        <ChartPanel title="Achats agrégés (semaines ISO)">
          {inv?.purchaseValueWeekly?.length ? (
            <>
              <p className="mb-2 text-[11px] text-foreground-muted">
                Flux achats fenêtre (~{Math.round(inv.inboundValueApprox).toLocaleString("fr-DZ")} DA agrégées).
              </p>
              <div className="h-[228px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={inv.purchaseValueWeekly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                    <XAxis dataKey="week" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <Tooltip formatter={(value: number) => [`${Math.round(value).toLocaleString("fr-DZ")} DA`, ""]} />
                    <Line type="monotone" dataKey="amount" stroke="#0369a1" strokeWidth={2} dot={false} name="Achats DA" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <EmptyHint />
          )}
        </ChartPanel>

        <ChartPanel title="Pertes péremption (valorisation indicative)">
          {inv?.expiryLossWeekly?.length ? (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={inv.expiryLossWeekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                  <XAxis dataKey="week" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="valueEstimate" stroke="#9333ea" fill="#ddd6fe66" strokeWidth={2} name="Perte DA est." />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyHint />
          )}
        </ChartPanel>

        <ChartPanel title="Fournisseur — valorisation entrants">
          {inv?.supplierDependency?.length ? (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={inv.supplierDependency.slice(0, 10)} margin={{ left: 140 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis type="category" dataKey="supplierName" width={138} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`${Math.round(v).toLocaleString("fr-DZ")} DA`, "entrées achat"]} />
                  <Bar dataKey="purchaseValue" fill="#0f766e" radius={[4, 4, 4, 4]} name="Valorisation DA" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyHint />
          )}
        </ChartPanel>

        <ChartPanel title="Déchets chantier fabrication">
          {prd?.wasteTrendWeekly?.length ? (
            <div className="h-[236px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={prd.wasteTrendWeekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="qty" fill="#c2410c" name="Qté brute" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyHint />
          )}
        </ChartPanel>

        <ChartPanel title="Opérateurs — minutes journalisées">
          {prd?.operatorProductivity?.length ? (
            <div className="h-[236px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={prd.operatorProductivity.slice(0, 10)} margin={{ left: 150 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis type="category" dataKey="operatorName" width={148} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="runtimeMinutes" fill="#1d4ed8" name="Minutes" radius={[4, 4, 4, 4]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyHint />
          )}
        </ChartPanel>

        <ChartPanel title="RH — présences hebdomadaires (index de charge)">
          {hr?.attendanceStatusWeekly?.length ? (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hr.attendanceStatusWeekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                  <XAxis dataKey="week" tick={{ fill: "#94a3b8", fontSize: 9 }} angle={-20} dy={16} dx={8} interval={Math.floor(hr.attendanceStatusWeekly.length / 10)} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line dataKey="presentOrEquivalent" type="monotone" stroke="#059669" dot={false} name="Équivalence présente" strokeWidth={2} />
                  <Line dataKey="absentEquivalent" type="monotone" stroke="#b91c1c" dot={false} name="Absent" strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyHint />
          )}
        </ChartPanel>

        <ChartPanel title="Masse salariale nette (mensuel)">
          {hr?.payrollNetMonthly?.length ? (
            <div className="h-[236px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hr.payrollNetMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`${Math.round(v).toLocaleString("fr-DZ")} DA`, "nettoyé bulletin"]} />
                  <Bar dataKey="netAmount" fill="#0ea5e9" name="Net payé DA" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyHint />
          )}
        </ChartPanel>

        <ChartPanel title="Commercial — CA hebdo">
          {sl?.revenueWeekly?.length ? (
            <div className="h-[236px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sl.revenueWeekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                  <XAxis dataKey="week" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`${Math.round(v).toLocaleString("fr-DZ")} DA`, "CA validé"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#065f46" fill="#bbf7d080" strokeWidth={2} name="CA" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyHint />
          )}
        </ChartPanel>

        <ChartPanel title="Top SKU / CA ligne">
          {sl?.topProducts?.length ? (
            <div className="space-y-2 text-[13px]">
              <div className="flex flex-wrap justify-between rounded-xl bg-surface-muted px-4 py-2 text-[12px]">
                <span className="text-foreground-muted">Solde résiduel non encaissé (approx.)</span>
                <span className="font-mono font-bold">
                  {(sl.unpaidSnapshot?.outstandingEstimated ?? 0).toLocaleString("fr-DZ")} DA
                </span>
              </div>
              <table className="w-full border-collapse text-left">
                <thead className="text-[11px] uppercase text-foreground-muted">
                  <tr>
                    <th className="pb-2 pr-2 font-semibold">Article</th>
                    <th className="pb-2 pr-2 font-semibold text-right">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {sl.topProducts.slice(0, 14).map((p) => (
                    <tr key={p.name} className="border-t border-border/60">
                      <td className="py-1">{p.name}</td>
                      <td className="py-1 text-right font-mono">{Math.round(p.revenue).toLocaleString("fr-DZ")} DA</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyHint />
          )}
        </ChartPanel>
      </div>
      </AsyncStatePanel>
    </div>
  );
}

function ChartPanel(props: { title: string; children: ReactNode }) {
  return (
    <div className="erp-panel flex flex-col border border-border/80 bg-surface p-3">
      <div className="mb-3 text-[12.5px] font-semibold text-foreground">{props.title}</div>
      <div className="min-h-[120px] flex-1">{props.children}</div>
    </div>
  );
}

function EmptyHint() {
  return <div className="text-[13px] text-foreground-muted">Pas de granularité donnée dans la fenêtre.</div>;
}
