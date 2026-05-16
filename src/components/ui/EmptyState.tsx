import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";

export function EmptyState(props: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const Icon = props.icon;
  return (
    <div
      className={cn(
        "flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-surface-muted p-10 text-center",
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated shadow-sm ring-1 ring-border">
        <Icon className="h-7 w-7 text-accent" strokeWidth={2} />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-foreground">{props.title}</h3>
        {props.description ? (
          <p className="max-w-xl text-base text-foreground-muted">{props.description}</p>
        ) : null}
      </div>
      {props.action ? <div>{props.action}</div> : null}
    </div>
  );
}
