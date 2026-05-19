import type { ReactElement } from "react";
import { useToastStore } from "@/stores/toast-store";

export function ToastHost(): ReactElement {
  const items = useToastStore((s) => s.items);
  return (
    <div className="pointer-events-none fixed right-4 top-14 z-[200] flex w-80 flex-col gap-2" data-testid="toast-host">
      {items.map((t) => (
        <div
          key={t.id}
          data-testid={`toast-${t.tone}`}
          data-toast-message={t.message}
          className={`pointer-events-auto rounded-xl border px-3 py-2 text-[12px] font-semibold shadow-lg ${
            t.tone === "error"
              ? "border-danger/40 bg-danger/15 text-danger-foreground"
              : t.tone === "success"
                ? "border-accent/40 bg-accent/15 text-accent-foreground"
                : "border-border bg-surface-muted text-foreground"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
