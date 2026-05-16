import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/cn";

export type RowMenuAction = {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
};

type Props = {
  label?: string;
  actions: RowMenuAction[];
  className?: string;
  dense?: boolean;
};

/**
 * Menu compact type « trois points » — clavier : ⌫ ouvre avec Enter/Espace ; Escape ferme ; navigation flèche.
 */
export function RowActionsMenu(props: Props) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dense = props.dense !== false;

  useEffect(() => {
    function onPointerDown(ev: MouseEvent): void {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative inline-flex justify-end", props.className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${baseId}-menu`}
        className={cn(
          "focus-ring inline-flex items-center gap-1 border border-border bg-surface-muted font-semibold text-foreground-muted hover:bg-surface hover:text-foreground",
          dense ? "h-7 rounded px-1.5 text-[11px]" : "h-9 rounded px-2 text-[12px]",
        )}
        onClick={() => setOpen((o) => !o)}
      >
        {dense ? <MoreHorizontal className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        {props.label ? <span>{props.label}</span> : null}
      </button>
      {open ? (
        <div
          id={`${baseId}-menu`}
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[160px] border border-border bg-surface py-1 text-[11.5px] shadow-[0_8px_24px_rgb(0_0_0_/_.18)]"
        >
          {props.actions.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left font-semibold hover:bg-surface-muted",
                a.danger ? "text-danger" : "",
                a.disabled ? "opacity-45" : "",
              )}
              onClick={() => {
                if (a.disabled) return;
                a.onSelect();
                setOpen(false);
              }}
            >
              <span>{a.label}</span>
              {a.shortcut ? <span className="font-mono text-[10px] text-foreground-muted">{a.shortcut}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
