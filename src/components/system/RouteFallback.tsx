/** Suspense minimal pendant chargement des routes lazy. */
export function RouteFallback() {
  return (
    <div className="flex min-h-[42vh] flex-col items-center justify-center gap-4 px-6 py-10">
      <div
        className="h-10 w-10 animate-pulse rounded-full bg-surface-muted ring-2 ring-[rgb(var(--color-border))]"
        aria-hidden
      />
      <p className="text-[13px] font-semibold tracking-tight text-foreground-muted">
        Chargement du module…
      </p>
    </div>
  );
}
