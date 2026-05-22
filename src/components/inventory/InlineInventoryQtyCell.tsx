import { IPC_CHANNELS } from "@shared/ipc-channels";
import { manualAdjustmentSchema } from "@shared/schemas/inventory";
import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";

import { samyInvoke } from "@/lib/samy";
import { cn } from "@/lib/cn";
import { useToastStore } from "@/stores/toast-store";

type Props = {
  materialKind: "RAW" | "PACKAGING";
  materialId: string;
  displayQtySerialized: string;
  isLowStock: boolean;
  disabled: boolean;
  onCommitted: () => Promise<void>;
};

/** Ajustement physiques ciblés (MANUAL_ADJUSTMENT) — F2 puis Entrée / Esc abandon. */
export function InlineInventoryQtyCell(props: Props) {
  const toast = useToastStore((t) => t.push);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.displayQtySerialized);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(props.displayQtySerialized);
  }, [props.displayQtySerialized, editing]);

  async function commit(): Promise<void> {
    if (props.disabled) return;
    setSaving(true);
    try {
      const dto = manualAdjustmentSchema.parse({
        materialKind: props.materialKind,
        rawMaterialId: props.materialKind === "RAW" ? props.materialId : undefined,
        packagingMaterialId: props.materialKind === "PACKAGING" ? props.materialId : undefined,
        targetQty: draft,
        note: "Ajustement rapide tableau matières",
      });
      await samyInvoke(IPC_CHANNELS.INVENTORY_MOVEMENT_MANUAL_ADJUSTMENT, dto);
      setEditing(false);
      await props.onCommitted();
      toast("success", "Stock ajusté (écrit grand-livre).");
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function onKey(ev: KeyboardEvent<HTMLButtonElement | HTMLInputElement>): void {
    if (ev.key === "Escape") {
      ev.preventDefault();
      setDraft(props.displayQtySerialized);
      setEditing(false);
    }
    if (ev.key === "Enter" && editing) {
      ev.preventDefault();
      void commit();
    }
    if (ev.key === "F2" && !editing && !props.disabled) {
      ev.preventDefault();
      setEditing(true);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          className={cn(
            "erp-input h-7 w-[88px] px-1.5 py-0 font-mono text-[11px]",
            props.isLowStock ? "ring-1 ring-danger/55" : "",
          )}
          value={draft}
          autoFocus
          disabled={saving}
          aria-label="Quantité physique cible"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={props.disabled || saving}
      title={props.disabled ? "" : "F2 ajuster qté physique (grand-livre)"}
      className={cn(
        "font-mono tabular-nums hover:underline",
        props.isLowStock ? "font-semibold text-danger" : "",
      )}
      onClick={() => {
        if (!props.disabled) setEditing(true);
      }}
      onKeyDown={onKey}
    >
      {props.displayQtySerialized}
    </button>
  );
}
