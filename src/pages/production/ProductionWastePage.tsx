import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { inventorySearchSchema } from "@shared/schemas/inventory";
import { productionWasteRegisterSchema } from "@shared/schemas/production";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { invalidateInventoryCaches } from "@/lib/invalidate-ui-cache";
import { samyInvoke } from "@/lib/samy";

type RawBrief = { id: string; sku: string; labelFr: string };

type BatchBrief = { id: string; code: string; recipeLabel: string };

export function ProductionWastePage() {
  const { can } = usePermissions();
  const canExec = can(PERMISSIONS.PRODUCTION_EXECUTE);

  const [catalog, setCatalog] = useState<RawBrief[]>([]);
  const [batches, setBatches] = useState<BatchBrief[]>([]);
  const [rawMaterialId, setRawMaterialId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [qtyLost, setQtyLost] = useState("");
  const [note, setNote] = useState("");
  const [inventoryKind, setInventoryKind] = useState<"PRODUCTION_WASTE" | "DAMAGED_LOSS">("PRODUCTION_WASTE");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const filters = inventorySearchSchema.parse({ page: 1, pageSize: 280, includeInactive: false });
      const raw = await samyInvoke<{ items: RawBrief[] }>(IPC_CHANNELS.INVENTORY_RAW_LIST, filters);
      setCatalog(raw.items);

      const lots = await samyInvoke<{ items: Array<{ id: string; code: string; recipeLabel: string }> }>(
        IPC_CHANNELS.PRODUCTION_BATCH_LIST,
        { page: 1, pageSize: 120 },
      );
      setBatches(lots.items.map((b) => ({ id: b.id, code: b.code, recipeLabel: b.recipeLabel })));
    })().catch(console.error);
  }, []);

  async function submit(): Promise<void> {
    setError(null);
    setMessage(null);

    if (!canExec) {
      setError("Permission refusée.");
      return;
    }

    const dto = productionWasteRegisterSchema.parse({
      batchId: batchId.trim().length ? batchId.trim() : null,
      rawMaterialId,
      qtyLost,
      note: note.trim().length ? note.trim() : null,
      inventoryKind,
    });

    await samyInvoke(IPC_CHANNELS.PRODUCTION_REGISTER_WASTE, dto);
    invalidateInventoryCaches();
    setQtyLost("");
    setNote("");
    setMessage("Mouvement déchet enregistré dans le grand-livre.");
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pertes atelier & rebuts"
        subtitle="Chaque saisie émet un StockMovement (PRODUCTION_WASTE ou DAMAGED_LOSS). Aucune mise à jour directe des stocks."
      />

      {!canExec ? (
        <p className="rounded border border-warning/50 bg-warning/10 px-3 py-2 text-[12px] font-semibold text-warning">Consultation seule — permission production.execute requise.</p>
      ) : null}

      {error ? <div className="border border-danger/60 bg-danger/10 px-3 py-2 text-[12px] font-semibold text-danger">{error}</div> : null}
      {message ? <div className="border border-accent/40 bg-accent/10 px-3 py-2 text-[12px] font-semibold text-accent">{message}</div> : null}

      <section className="grid gap-4 border border-border bg-surface-muted/35 p-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-[10px] font-semibold uppercase text-foreground-muted">Matière affectée</span>
          <select className="control-chrome" value={rawMaterialId} onChange={(e) => setRawMaterialId(e.target.value)} disabled={!canExec}>
            <option value="">—</option>
            {catalog.map((raw) => (
              <option key={raw.id} value={raw.id}>
                {raw.sku} · {raw.labelFr}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-[10px] font-semibold uppercase text-foreground-muted">Contexte lot (facultatif)</span>
          <select className="control-chrome font-mono text-[11px]" value={batchId} onChange={(e) => setBatchId(e.target.value)} disabled={!canExec}>
            <option value="">Hors lot / sol atelier</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.code} — {batch.recipeLabel}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-[10px] font-semibold uppercase text-foreground-muted">Quantité perdue (positive)</span>
          <input className="control-chrome font-mono" value={qtyLost} onChange={(e) => setQtyLost(e.target.value)} disabled={!canExec} />
        </label>

        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-[10px] font-semibold uppercase text-foreground-muted">Nature mouvement</span>
          <select className="control-chrome" value={inventoryKind} onChange={(e) => setInventoryKind(e.target.value as typeof inventoryKind)} disabled={!canExec}>
            <option value="PRODUCTION_WASTE">Perte fabrication (production_waste)</option>
            <option value="DAMAGED_LOSS">Avarie / casse (damaged_loss)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[12px] md:col-span-2">
          <span className="text-[10px] font-semibold uppercase text-foreground-muted">Commentaire traçabilité</span>
          <textarea className="control-chrome min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} disabled={!canExec} />
        </label>

        <div className="md:col-span-2">
          <button
            type="button"
            className="border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground disabled:opacity-40"
            disabled={!canExec}
            onClick={() => submit().catch((err) => setError(err instanceof Error ? err.message : String(err)))}
          >
            Poster mouvement
          </button>
        </div>
      </section>
    </div>
  );
}
