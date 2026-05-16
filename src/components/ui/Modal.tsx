import { cn } from "@/lib/cn";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal(props: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  if (!props.open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "w-full max-w-xl rounded-2xl border border-border bg-surface-elevated shadow-2xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <h2 className="text-xl font-semibold leading-snug text-foreground">{props.title}</h2>
          <button
            type="button"
            className="focus-ring inline-flex min-h-touch min-w-touch items-center justify-center rounded-xl border border-border bg-surface-muted text-foreground hover:bg-surface"
            onClick={props.onClose}
            aria-label="Fermer la fenêtre"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{props.children}</div>
        {props.footer ? (
          <div className="border-t border-border px-6 py-4">{props.footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
