import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";
import type { ColumnDef } from "@tanstack/react-table";

type ProfitOverview = {
  periodLabel: string;
  revenueValidated: number;
  productionIngredientCost: number;
  productionLaborEstimate: number;
  productionOverheadEstimate: number;
  payrollNetOperational: number;
  wasteValueEstimate: number;
  expiryLossValueEstimate: number;
  grossMarginEstimate: number;
  netMarginEstimate: number;
  costToRevenueRatio: number;
  productRanking: Array<{
    sku: string;
    name: string;
    revenue: number;
    qtySold: number;
    estimatedCost: number | null;
    marginEstimate: number | null;
  }>;
};

function rangeLastMonth(): { from: string; to: string } {
  const e = new Date();
  const s = new Date();
  s.setMonth(s.getMonth() - 1);
  return {
    from: s.toISOString().slice(0, 10) + "T00:00:00.000Z",
    to: e.toISOString().slice(0, 10) + "T23:59:59.999Z",
  };
}

export function ReportingProfitabilityPage() {
  const { can } = usePermissions();

  const [from, setFrom] = useState(() => rangeLastMonth().from.slice(0, 10));
  const [to, setTo] = useState(() => rangeLastMonth().to.slice(0, 10));

  const [dto, setDto] = useState<ProfitOverview | null>(null);

  const iso = useMemo(
    () => ({
      from: new Date(`${from}T00:00:00.000Z`).toISOString(),
      to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    }),
    [from, to],
  );

  const reload = useCallback(async (): Promise<void> => {
    if (!can(PERMISSIONS.REPORTS_FINANCIAL)) return;
    const data = await samyInvoke<ProfitOverview>(IPC_CHANNELS.REPORTS_PROFITABILITY_OVERVIEW, iso);
    setDto(data);
  }, [can, iso]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!can(PERMISSIONS.REPORTS_FINANCIAL)) return <Navigate to="/rapports" replace />;

  const cols = useMemo<ColumnDef<ProfitOverview["productRanking"][number]>[]>(
    () => [
      { header: "SKU", accessorKey: "sku", size: 90 },
      { header: "Produit", accessorKey: "name" },
      {
        header: "CA DA",
        accessorKey: "revenue",
        cell: ({ row }) => Math.round(row.original.revenue).toLocaleString("fr-DZ"),
      },
      {
        header: "Coût MP est.",
        accessorKey: "estimatedCost",
        cell: ({ row }) =>
          row.original.estimatedCost == null ? "—" : `${Math.round(row.original.estimatedCost).toLocaleString("fr-DZ")}`,
      },
      {
        header: "Marge est.",
        accessorKey: "marginEstimate",
        cell: ({ row }) =>
          row.original.marginEstimate == null ? "—" : `${Math.round(row.original.marginEstimate).toLocaleString("fr-DZ")}`,
      },
    ],
    [],
  );

  const chartRanking = dto?.productRanking.slice(0, 12).map((p) => ({
    nom: `${p.name}`.slice(0, 32),
    marge:
      typeof p.marginEstimate === "number" && !Number.isNaN(p.marginEstimate)
        ? Math.round(p.marginEstimate)
        : Math.round(Math.max(0, p.revenue - (p.estimatedCost ?? p.revenue * 0.35))),
  }));

  return (
    <div className="flex flex-col gap-4 pb-12">
      <PageHeader
        title="Rentabilité opérationnelle"
        subtitle="Synthèses MP + fabrication + RH + commercials — sans comptabilité générale."
      />

      <section className="erp-panel flex flex-wrap items-end gap-3 p-4 text-[13px]">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Du
          <input type="date" className="control-chrome h-9 px-2" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Au
          <input type="date" className="control-chrome h-9 px-2" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="control-chrome h-9 px-4 text-[12px] font-semibold" onClick={() => void reload()}>
          Recalc.
        </button>
      </section>

      {dto ? (
        <section className="grid gap-3 md:grid-cols-3">
          <MiniStat label="CA validé DA" value={Math.round(dto.revenueValidated).toLocaleString("fr-DZ")} tone="muted" />
          <MiniStat
            label="Coûts MP fabrication"
            value={Math.round(dto.productionIngredientCost).toLocaleString("fr-DZ")}
            tone="alert"
          />
          <MiniStat label="Charge paie (fenêtre croisée)" value={Math.round(dto.payrollNetOperational).toLocaleString("fr-DZ")} />
          <MiniStat label="Déchets MP (valeur PU)" value={Math.round(dto.wasteValueEstimate).toLocaleString("fr-DZ")} tone="alert" />
          <MiniStat label="Péremptions" value={Math.round(dto.expiryLossValueEstimate).toLocaleString("fr-DZ")} tone="alert" />
          <MiniStat
            label="Marge brute indicative"
            value={`${Math.round(dto.grossMarginEstimate).toLocaleString("fr-DZ")} DA`}
          />
          <MiniStat label="Charge opérationnelle / CA" value={`${(dto.costToRevenueRatio * 100).toFixed(1)} %`} tone="muted" />
        </section>
      ) : (
        <Empty />
      )}

      {chartRanking?.length ? (
        <div className="erp-panel border border-border/80 bg-surface p-3">
          <div className="mb-2 text-[13px] font-semibold text-foreground">Top articles par marge estimée</div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRanking} margin={{ bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.35)" />
                <XAxis dataKey="nom" tick={{ fill: "#94a3b8", fontSize: 9 }} angle={-18} dx={12} dy={12} interval={0} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString("fr-DZ")} DA`, "marge est."]} />
                <Bar dataKey="marge" fill="#166534" name="DA" radius={[6, 6, 2, 2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {dto?.productRanking.length ? (
        <div className="erp-panel p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Détail produits vendus</div>
          <DataTable columns={cols} data={dto.productRanking} emptyLabel="Aucune ligne." />
        </div>
      ) : (
        <Empty />
      )}
    </div>
  );
}

function MiniStat(props: { label: string; value: string; tone?: "alert" | "muted" }) {
  return (
    <div
      className={
        props.tone === "alert"
          ? "erp-panel border-l-4 border-danger/80 bg-danger/5 px-4 py-3"
          : "erp-panel border border-border/80 px-4 py-3"
      }
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{props.label}</div>
      <div className={`mt-1 font-mono text-[18px] font-bold ${props.tone === "muted" ? "text-foreground/80" : "text-foreground"}`}>
        {props.value}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="erp-panel px-6 py-10 text-center text-[13px] text-foreground-muted">Calcul en attente...</div>;
}
