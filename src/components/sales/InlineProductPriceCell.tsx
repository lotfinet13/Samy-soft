import { IPC_CHANNELS } from "@shared/ipc-channels";
import { productUpsertSchema } from "@shared/schemas/sales";
import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";

import { samyInvoke } from "@/lib/samy";
import { cn } from "@/lib/cn";
import { useToastStore } from "@/stores/toast-store";

type Props = {
  productId: string;
  label: string;
  sellingPriceSerialized: string;
  disabled: boolean;
  onSaved: () => Promise<void>;
};

/** Prix catalogue compact — Enter valide · Esc abandon. */
export function InlineProductPriceCell(props: Props) {
  const toast = useToastStore((t) => t.push);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.sellingPriceSerialized);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(props.sellingPriceSerialized);
  }, [props.sellingPriceSerialized, editing]);

  async function commit(): Promise<void> {
    if (props.disabled) return;
    setBusy(true);
    try {
      const detail = await samyInvoke<{
        id: string;
        sku: string;
        name: string;
        category: string | null;
        sellingPriceSerialized: string;
        unit: string;
        recipeId: string | null;
        packagingMaterialId: string | null;
        barcode: string | null;
        notes: string | null;
        isActive: boolean;
      }>(IPC_CHANNELS.SALES_PRODUCT_GET, props.productId);

      await samyInvoke(
        IPC_CHANNELS.SALES_PRODUCT_UPSERT,
        productUpsertSchema.parse({
          id: detail.id,
          sku: detail.sku,
          name: detail.name,
          category: detail.category ?? null,
          sellingPrice: draft,
          unit: detail.unit as "KG" | "G" | "L" | "ML" | "UNIT",
          recipeId: detail.recipeId,
          packagingMaterialId: detail.packagingMaterialId,
          barcode: detail.barcode,
          notes: detail.notes,
          isActive: detail.isActive,
        }),
      );
      setEditing(false);
      await props.onSaved();
      toast("success", "Prix catalogue mis à jour.");
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onKey(ev: KeyboardEvent<HTMLButtonElement | HTMLInputElement>): void {
    if (ev.key === "Escape") {
      ev.preventDefault();
      setDraft(props.sellingPriceSerialized);
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
      <input
        className={cn("erp-input h-7 w-[96px] px-1.5 py-0 font-mono text-[11px]")}
        value={draft}
        autoFocus
        disabled={busy}
        aria-label={`Prix ${props.label}`}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={props.disabled || busy}
      title={props.disabled ? "" : "F2 modifier prix vente"}
      className="font-mono text-[11.5px] tabular-nums hover:underline"
      onClick={() => {
        if (!props.disabled) setEditing(true);
      }}
      onKeyDown={onKey}
    >
      {props.sellingPriceSerialized}
    </button>
  );
}
