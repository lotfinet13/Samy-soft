import type { ReactNode } from "react";

type Props = {
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  loadingLabel?: string;
  empty?: boolean;
  emptyLabel?: string;
  children: ReactNode;
};

export function AsyncStatePanel(props: Props) {
  const loadingLabel = props.loadingLabel ?? "Chargement…";

  if (props.loading) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-border bg-surface-elevated px-6 py-10">
        <p className="text-sm text-foreground-muted">{loadingLabel}</p>
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-6 py-8 text-center">
        <p className="text-sm text-danger">{props.error}</p>
        {props.onRetry ? (
          <button
            type="button"
            className="focus-ring rounded-lg border border-border bg-surface px-4 py-2 text-xs font-semibold"
            onClick={() => props.onRetry?.()}
          >
            Réessayer
          </button>
        ) : null}
      </div>
    );
  }

  if (props.empty) {
    return (
      <div className="rounded-2xl border border-border bg-surface-elevated px-6 py-10 text-center text-sm text-foreground-muted">
        {props.emptyLabel ?? "Aucune donnée."}
      </div>
    );
  }

  return <>{props.children}</>;
}
