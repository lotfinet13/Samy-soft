import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { productionBatchCreateSchema, productionBatchLifecycleSchema, productionBatchCompleteSchema } from "@shared/schemas/production";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { invalidateInventoryCaches } from "@/lib/invalidate-ui-cache";
import { samyInvoke } from "@/lib/samy";

type RecipeOption = { id: string; labelFr: string; code: string };
type BatchRow = {
  id: string;
  code: string;
  status: string;
  recipeCode: string;
  recipeLabel: string;
  plannedQtySerialized: string;
  producedQtySerialized: string | null;
  creator: string;
  operator: string | null;
};

export function ProductionBatchesPage() {
  const { can } = usePermissions();
  const canExec = can(PERMISSIONS.PRODUCTION_EXECUTE);

  const [rows, setRows] = useState<BatchRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 25 });
  const [recipeOptions, setRecipeOptions] = useState<RecipeOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState<BatchRow | null>(null);

  const [plannedQty, setPlannedQty] = useState("100");
  const [recipeId, setRecipeId] = useState("");
  const [produceQty, setProduceQty] = useState("");
  const [qBatch, setQBatch] = useState("");

  async function reload(page = meta.page, qOverride?: string): Promise<void> {
    const qs = qOverride !== undefined ? qOverride : qBatch;
    const payload = await samyInvoke<{ items: BatchRow[]; total: number; page: number; pageSize: number }>(
      IPC_CHANNELS.PRODUCTION_BATCH_LIST,
      { page, pageSize: meta.pageSize, q: qs },
    );
    setRows(payload.items);
    setMeta({ total: payload.total, page: payload.page, pageSize: payload.pageSize });
  }

  useEffect(() => {
    void reload(1).catch(console.error);
    void (async () => {
      const catalog = await samyInvoke<{ items: Array<{ id: string; labelFr: string; code: string }> }>(
        IPC_CHANNELS.PRODUCTION_RECIPE_LIST,
        { page: 1, pageSize: 200 },
      );
      setRecipeOptions(catalog.items.map((item) => ({ id: item.id, labelFr: item.labelFr, code: item.code })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo<ColumnDef<BatchRow>[]>(
    () => [
      { header: "Lot", accessorKey: "code", cell: ({ row }) => <span className="font-mono text-[11px] text-accent">{row.original.code}</span> },
      { header: "Recette", accessorFn: (row) => `${row.recipeCode} · ${row.recipeLabel}` },
      {
        header: "Statut",
        accessorKey: "status",
        cell: ({ row }) => (
          <span className="rounded border border-border px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wide">{row.original.status}</span>
        ),
      },
      { header: "Plan volume", accessorKey: "plannedQtySerialized" },
      {
        header: "Pilote",
        accessorKey: "operator",
        cell: ({ row }) => <span className="text-[11px]">{row.original.operator ?? "—"}</span>,
      },
      {
        header: "Créé par",
        accessorKey: "creator",
        cell: ({ row }) => <span className="text-[11px] text-foreground-muted">{row.original.creator}</span>,
      },
      {
        header: "",
        id: "lifecycle",
        cell: ({ row }) =>
          canExec ? (
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-accent">
              {row.original.status === "PLANNED" ? (
                <button type="button" className="hover:underline" onClick={() => startLot(row.original.id).catch(console.error)}>
                  Démarrer
                </button>
              ) : null}
              {row.original.status === "IN_PROGRESS" ? (
                <>
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => {
                      setProduceQty(row.original.plannedQtySerialized);
                      setCompleteOpen(row.original);
                    }}
                  >
                    Terminer
                  </button>
                  <button type="button" className="text-danger hover:underline" onClick={() => cancelLot(row.original.id).catch(console.error)}>
                    Stop
                  </button>
                </>
              ) : null}
            </div>
          ) : null,
      },
    ],
    [canExec],
  );

  async function submitCreate(): Promise<void> {
    productionBatchCreateSchema.parse({ recipeId, plannedQty });
    await samyInvoke(IPC_CHANNELS.PRODUCTION_BATCH_CREATE, { recipeId, plannedQty });
    setCreateOpen(false);
    await reload(1).catch(console.error);
  }

  async function startLot(id: string): Promise<void> {
    productionBatchLifecycleSchema.parse({ batchId: id });
    await samyInvoke(IPC_CHANNELS.PRODUCTION_BATCH_START, { batchId: id });
    await reload(meta.page).catch(console.error);
  }

  async function cancelLot(id: string): Promise<void> {
    productionBatchLifecycleSchema.parse({ batchId: id });
    await samyInvoke(IPC_CHANNELS.PRODUCTION_BATCH_CANCEL, { batchId: id });
    invalidateInventoryCaches();
    await reload(meta.page).catch(console.error);
  }

  async function finishLot(): Promise<void> {
    if (!completeOpen) return;
    productionBatchCompleteSchema.parse({ batchId: completeOpen.id, producedQty: produceQty });
    await samyInvoke(IPC_CHANNELS.PRODUCTION_BATCH_COMPLETE, { batchId: completeOpen.id, producedQty: produceQty });
    setCompleteOpen(null);
    invalidateInventoryCaches();
    await reload(meta.page).catch(console.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Suivi des lots fabrications"
        subtitle="Planification → IN_PROGRESS (contrôle ruptures) → POST PRODUCTION_OUT automatique à la clôture."
        actions={
          canExec ? (
            <button type="button" className="border border-accent bg-accent px-3 py-2 text-[12px] font-semibold text-accent-foreground" onClick={() => setCreateOpen(true)}>
              Programmer lot
            </button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Recherche lot / recette
          <input
            className="control-chrome h-9 min-w-[220px] px-2 font-mono text-[12px]"
            value={qBatch}
            onChange={(e) => setQBatch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void reload(1);
            }}
          />
        </label>
        <button type="button" className="btn-primary h-9 px-3 text-[12px]" onClick={() => void reload(1)}>
          Filtrer
        </button>
        <button
          type="button"
          className="btn-secondary h-9 px-3 text-[12px]"
          onClick={() => {
            setQBatch("");
            void reload(1, "");
          }}
        >
          Réinit.
        </button>
      </div>

      <DataTable columns={columns} data={rows} emptyLabel="Aucun dossier lot local." />

      <div className="flex justify-between text-[11px] text-foreground-muted">
        <button type="button" disabled={meta.page <= 1} className="font-semibold text-accent disabled:opacity-40" onClick={() => reload(meta.page - 1).catch(console.error)}>
          Préc.
        </button>
        <button type="button" disabled={meta.page * meta.pageSize >= meta.total} className="font-semibold text-accent disabled:opacity-40" onClick={() => reload(meta.page + 1).catch(console.error)}>
          Suivante
        </button>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Programmation lot fabrication">
        <div className="space-y-4 text-[12px]">
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-foreground-muted">Recette cible</span>
            <select className="control-chrome" value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
              <option value="">—</option>
              {recipeOptions.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.code} · {recipe.labelFr}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-foreground-muted">Volume prévisionnel (aligné même unité que yield)</span>
            <input className="control-chrome font-mono" value={plannedQty} onChange={(event) => setPlannedQty(event.target.value)} />
          </label>
          <button type="button" className="border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground" onClick={() => submitCreate().catch(console.error)}>
            Générer code lot
          </button>
        </div>
      </Modal>

      <Modal open={Boolean(completeOpen)} onClose={() => setCompleteOpen(null)} title="Validation production réalisée">
        {completeOpen ? (
          <div className="space-y-4 text-[12px]">
            <p className="text-foreground-muted">
              Lot <span className="font-mono text-accent">{completeOpen.code}</span> passe en COMPLETED après sorties PRODUCTION_OUT.
            </p>
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-foreground-muted">Volume réalisé positif</span>
              <input className="control-chrome font-mono" value={produceQty} onChange={(event) => setProduceQty(event.target.value)} placeholder="Litres réels / palettes" />
            </label>
            <button type="button" className="border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground" onClick={() => finishLot().catch(console.error)}>
              Déclôturer mouvements
            </button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
