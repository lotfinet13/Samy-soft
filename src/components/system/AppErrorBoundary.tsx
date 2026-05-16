import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

function humanMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return "Une erreur inattendue s’est produite. Les détails ont été minimisés pour l’atelier.";
}

export class AppErrorBoundary extends Component<Props, { error?: Error | null }> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack = `${error.stack ?? ""} ${info.componentStack ?? ""}`.trim();
    console.error("[samy-soft-renderer-boundary]", error.message, stack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center text-foreground">
          <div className="text-lg font-semibold">Écran sécurisé</div>
          <p className="max-w-md text-sm text-foreground-muted">
            {humanMessage(this.state.error)}
          </p>
          <button
            type="button"
            className="focus-ring rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground"
            onClick={() => {
              this.setState({ error: null });
              window.location.hash = "#/";
              window.location.reload();
            }}
          >
            Recharger l’ERP
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
