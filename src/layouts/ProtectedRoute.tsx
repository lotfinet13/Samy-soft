import { useAuthStore } from "@/stores/auth-store";
import { Navigate, Outlet } from "react-router-dom";

export function SplashScreen() {
  return (
    <div className="flex h-full flex-col bg-surface text-foreground">
      <div className="flex h-2 w-full gap-px bg-sidebar-bg px-px">
        <span className="flex-1 bg-sidebar-accent/70" />
        <span className="w-24 bg-sidebar-border" />
        <span className="flex-1 bg-sidebar-muted" />
      </div>
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="w-full max-w-md border border-border bg-surface-elevated px-5 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">
            Poste workstation
          </p>
          <div className="mt-2 text-[14px] font-semibold tracking-tight">Chargement de la session…</div>
          <p className="mt-2 text-[12px] leading-snug text-foreground-muted">
            Vérification du contexte sécurisé et de la base SQLite locale.
          </p>
          <div className="mt-4 h-1.5 overflow-hidden bg-surface-muted">
            <div className="h-full w-1/2 animate-pulse bg-accent" />
          </div>
        </div>
      </div>
      <footer className="border-t border-border px-6 py-2 text-center text-[11px] text-foreground-muted">
        SAMY SOFT — ne pas fermer pendant l’initialisation
      </footer>
    </div>
  );
}

export function ProtectedRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const user = useAuthStore((state) => state.user);
  const bootstrapRequired = useAuthStore((state) => state.bootstrapRequired);

  if (!hydrated) return <SplashScreen />;
  if (bootstrapRequired) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}
