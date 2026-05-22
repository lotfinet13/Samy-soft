import { cn } from "@/lib/cn";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal(props: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  /** Playwright / QA hook */
  testId?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;
  const initialFocusDoneRef = useRef(false);

  useEffect(() => {
    if (!props.open) {
      initialFocusDoneRef.current = false;
      return;
    }

    const dialog = dialogRef.current;
    const body = bodyRef.current;

    const focusablesInDialog = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null,
      );

    const focusablesInBody = () =>
      Array.from(body?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null,
      );

    if (!initialFocusDoneRef.current) {
      initialFocusDoneRef.current = true;
      const initial = focusablesInBody()[0] ?? focusablesInDialog()[0];
      initial?.focus();
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const nodes = focusablesInDialog();
      if (nodes.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const idx = active ? nodes.indexOf(active) : -1;

      if (event.shiftKey) {
        if (idx <= 0) {
          event.preventDefault();
          nodes[nodes.length - 1]?.focus();
        }
      } else if (idx === nodes.length - 1) {
        event.preventDefault();
        nodes[0]?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props.open]);

  if (!props.open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
      role="presentation"
      data-testid={props.testId ? `${props.testId}-backdrop` : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={props.testId}
        className={cn(
          "w-full max-w-xl rounded-2xl border border-border bg-surface-elevated shadow-2xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <h2 id={titleId} className="text-xl font-semibold leading-snug text-foreground">
            {props.title}
          </h2>
          <button
            type="button"
            className="focus-ring inline-flex min-h-touch min-w-touch items-center justify-center rounded-xl border border-border bg-surface-muted text-foreground hover:bg-surface"
            onClick={props.onClose}
            aria-label="Fermer la fenêtre"
            data-testid={props.testId ? `${props.testId}-close` : undefined}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div ref={bodyRef} className="px-6 py-5">
          {props.children}
        </div>
        {props.footer ? (
          <div className="border-t border-border px-6 py-4">{props.footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
