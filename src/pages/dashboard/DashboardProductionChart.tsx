import { Gauge } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

export type WeekPoint = { jour: string; lots: number };

export const WEEKLY_PLACEHOLDER: WeekPoint[] = [
  { jour: "Lun", lots: 0 },
  { jour: "Mar", lots: 0 },
  { jour: "Mer", lots: 0 },
  { jour: "Jeu", lots: 0 },
  { jour: "Ven", lots: 0 },
  { jour: "Sam", lots: 0 },
  { jour: "Dim", lots: 0 },
];

type Props = {
  data?: WeekPoint[];
};

export function DashboardProductionChart(props: Props) {
  const data = props.data ?? WEEKLY_PLACEHOLDER;
  return (
    <div className="border border-border bg-surface-elevated p-4 shadow-inner">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-foreground-muted">
            Flux production semaine
          </div>
          <div className="mt-1 text-[15px] font-semibold tracking-tight text-foreground">
            Cadence lots / équipe
          </div>
          <p className="mt-1 text-[11.5px] text-foreground-muted">
            Série illustrative — alimentée par les lots réels lorsque les données atelier sont
            consolidées.
          </p>
        </div>
        <Gauge className="h-7 w-7 text-accent" strokeWidth={2} aria-hidden />
      </div>
      <div className="mt-4 h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="jour" stroke="rgb(var(--color-fg-muted))" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                borderRadius: 4,
                borderColor: "rgb(var(--color-border))",
                fontSize: 12,
              }}
              labelStyle={{ fontWeight: 600 }}
              cursor={{ fill: "rgb(var(--color-surface-muted) / 0.45)" }}
            />
            <Bar dataKey="lots" fill="rgb(var(--color-accent))" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
