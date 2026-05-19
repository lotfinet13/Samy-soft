import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { Navigate } from "react-router-dom";
import { CartesianGrid, ComposedChart, Bar, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { AsyncStatePanel } from "@/components/system/AsyncStatePanel";
import { useAsyncLoad } from "@/hooks/useAsyncLoad";
import { samyInvoke } from "@/lib/samy";

type MgmtDTO = {
  currencyCode: string;
  estimatedMonthlyPl: Array<{
    monthKey: string;
    revenue: number;
    productionCostIngredient: number;
    payrollNet: number;
    netEstimate: number;
  }>;
  commercial: {
    invoiceCountValidated: number;
    averageBasket: number;
    unpaidOutstanding: number;
    partialOutstanding: number;
  };
};

export function ReportingFinancialSummaryPage() {
  const { can } = usePermissions();
  const { data: dto, loading, error, reload } = useAsyncLoad(
    () => samyInvoke<MgmtDTO>(IPC_CHANNELS.REPORTS_MANAGEMENT_SUMMARY),
    [],
  );

  if (!can(PERMISSIONS.REPORTS_FINANCIAL)) return <Navigate to="/rapports" replace />;

  return (
    <div className="flex flex-col gap-4 pb-12">
      <PageHeader title="Synthèse directionnelle estimée" subtitle="Rolling 6 mois — aucune écriture comptable imposée." />

      <AsyncStatePanel loading={loading} error={error} onRetry={() => void reload()} loadingLabel="Chargement de la synthèse…">
      {dto?.estimatedMonthlyPl?.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Tickets validés cumul visible" value={`${dto.commercial.invoiceCountValidated}`} />
            <Stat label={`Panier moyen (${dto.currencyCode})`} value={`${Math.round(dto.commercial.averageBasket).toLocaleString("fr-DZ")}`} />
            <Stat label="Soldes ouverts • impayés" value={`${Math.round(dto.commercial.unpaidOutstanding).toLocaleString("fr-DZ")}`} />
            <Stat label="Soldes résiduels partiels" value={`${Math.round(dto.commercial.partialOutstanding).toLocaleString("fr-DZ")}`} />
          </div>

          <div className="erp-panel p-4">
            <div className="mb-3 text-[13px] font-semibold text-foreground">Évolution directionnelle (DA)</div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dto.estimatedMonthlyPl}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" vertical={false} />
                  <XAxis dataKey="monthKey" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString("fr-DZ")} ${dto.currencyCode}`} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="revenue" name="CA (validé fenêtre)" fill="#0ea5e9" />
                  <Bar dataKey="productionCostIngredient" name="Coûts MP cloturés (mois)" fill="#fca5a5" />
                  <Line type="monotone" dataKey="netEstimate" name="Écart opérationnel" stroke="#16a34a" strokeWidth={2} dot />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : dto ? (
        <p className="text-[13px] text-foreground-muted">Historique encore insuffisant pour une courbe.</p>
      ) : null}
      </AsyncStatePanel>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="erp-panel border border-border/80 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase text-foreground-muted">{props.label}</div>
      <div className="mt-2 font-mono text-[17px] font-bold text-foreground">{props.value}</div>
    </div>
  );
}
