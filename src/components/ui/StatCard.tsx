import { cn } from "@/lib/cn";

export function StatCard(props: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "warning";
}) {
  const toneClass =
    props.tone === "positive"
      ? "border-emerald-500/35 bg-emerald-500/5"
      : props.tone === "warning"
        ? "border-amber-400/35 bg-amber-400/10"
        : "border-border bg-surface-elevated";

  return (
    <div className={cn("rounded-[var(--erp-radius-panel)] border p-3 shadow-inner", toneClass)}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
        {props.label}
      </div>
      <div className="mt-1.5 tabular-nums text-[21px] font-semibold tracking-tight text-foreground">
        {props.value}
      </div>
      {props.hint ? (
        <div className="mt-2 text-[11px] leading-snug text-foreground-muted">{props.hint}</div>
      ) : null}
    </div>
  );
}
