import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const tone = props.tone ?? "default";
  const cancelLabel = props.cancelLabel ?? "Annuler";

  const footer: ReactNode = (
    <div className="flex flex-wrap justify-end gap-3">
      <button
        type="button"
        className="focus-ring inline-flex min-h-touch items-center justify-center rounded-xl border border-border bg-surface-muted px-5 text-base font-semibold text-foreground hover:bg-surface disabled:opacity-60"
        onClick={props.onCancel}
        disabled={props.busy}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        className={
          tone === "danger"
            ? "focus-ring inline-flex min-h-touch items-center justify-center rounded-xl bg-danger px-5 text-base font-semibold text-danger-foreground hover:opacity-95 disabled:opacity-60"
            : "focus-ring inline-flex min-h-touch items-center justify-center rounded-xl bg-accent px-5 text-base font-semibold text-accent-foreground hover:opacity-95 disabled:opacity-60"
        }
        onClick={props.onConfirm}
        disabled={props.busy}
      >
        {props.confirmLabel}
      </button>
    </div>
  );

  return (
    <Modal open={props.open} title={props.title} footer={footer} onClose={props.onCancel}>
      <p className="text-base leading-relaxed text-foreground-muted">{props.description}</p>
    </Modal>
  );
}
