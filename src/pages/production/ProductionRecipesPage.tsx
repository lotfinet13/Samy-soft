import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { inventorySearchSchema } from "@shared/schemas/inventory";
import { productionRecipeIngredientsReplaceSchema, productionRecipeUpsertSchema } from "@shared/schemas/production";
import { Copy, Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

type UnitCode = "KG" | "G" | "L" | "ML" | "UNIT";

type RecipeRow = {
  id: string;
  code: string;
  labelFr: string;
  category?: string | null;
  yieldQtySerialized: string;
  yieldUnit: string;
  ingredientCount: number;
  estimatedMinutes?: number | null;
};

type RecipeIngredientDetail = {
  rawMaterialId: string;
  sku?: string | null;
  labelFr?: string | null;
  quantitySerialized?: string | null;
  wastePctSerialized?: string | null;
  unit: UnitCode | string;
  optionalIngredient?: boolean | null;
  note?: string | null;
};

type RecipeDetail = {
  id: string;
  code: string;
  labelFr: string;
  category?: string | null;
  description?: string | null;
  productionNotes?: string | null;
  yieldQtySerialized: string;
  yieldUnit: UnitCode | string;
  estimatedMinutes?: number | null;
  outputPackagingMaterialId?: string | null;
  ingredients: RecipeIngredientDetail[];
};

type RawBrief = {
  id: string;
  sku: string;
  labelFr: string;
  unit: UnitCode | string;
};

function emptyIngredientRow(): BuilderRow {
  return {
    key: crypto.randomUUID(),
    rawMaterialId: "",
    quantity: "1",
    unit: "KG",
    optionalIngredient: false,
    wastePct: "0",
    note: "",
  };
}

type BuilderRow = {
  key: string;
  rawMaterialId: string;
  quantity: string;
  unit: UnitCode;
  optionalIngredient: boolean;
  wastePct: string;
  note: string;
};

export function ProductionRecipesPage() {
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.PRODUCTION_WRITE);
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 30, total: 0 });
  const [activeRecipe, setActiveRecipe] = useState<RecipeDetail | null>(null);
  const [catalog, setCatalog] = useState<RawBrief[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderRows, setBuilderRows] = useState<BuilderRow[]>([emptyIngredientRow()]);

  const [draft, setDraft] = useState({
    id: "" as string | undefined,
    code: "",
    labelFr: "",
    category: "",
    yieldQty: "100",
    yieldUnit: "KG" as UnitCode,
    productionNotes: "",
    estimatedMinutes: "",
    outputPackagingMaterialId: "",
  });

  async function reloadRecipeIndex(page = meta.page): Promise<void> {
    const res = await samyInvoke<{ items: RecipeRow[]; total: number; page: number; pageSize: number }>(
      IPC_CHANNELS.PRODUCTION_RECIPE_LIST,
      {
        page,
        pageSize: meta.pageSize,
        q: "",
        category: "",
        includeInactive: true,
      },
    );
    setRows(res.items);
    setMeta({ total: res.total, page: res.page, pageSize: res.pageSize });
  }

  useEffect(() => {
    void reloadRecipeIndex(1).catch(console.error);
    void (async () => {
      const filters = inventorySearchSchema.parse({
        page: 1,
        pageSize: 250,
        includeInactive: false,
      });
      const raw = await samyInvoke<{ items: RawBrief[] }>(IPC_CHANNELS.INVENTORY_RAW_LIST, filters);
      setCatalog(raw.items);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap données
  }, []);

  async function openNewRecipeSheet(): Promise<void> {
    setDraft({
      id: undefined,
      code: "",
      labelFr: "",
      category: "",
      yieldQty: "100",
      yieldUnit: "KG",
      productionNotes: "",
      estimatedMinutes: "",
      outputPackagingMaterialId: "",
    });
    setEditorOpen(true);
  }

  async function openFormulaBuilder(recipeId: string): Promise<void> {
    const recipe = await samyInvoke<RecipeDetail>(IPC_CHANNELS.PRODUCTION_RECIPE_GET, recipeId);
    setActiveRecipe(recipe);
    const mappedRows =
      recipe.ingredients.length === 0
        ? [emptyIngredientRow()]
        : recipe.ingredients.map((line) => ({
            key: crypto.randomUUID(),
            rawMaterialId: line.rawMaterialId,
            quantity: line.quantitySerialized ?? "0",
            unit: (line.unit ?? "KG") as UnitCode,
            optionalIngredient: Boolean(line.optionalIngredient),
            wastePct: line.wastePctSerialized ?? "0",
            note: line.note ?? "",
          }));
    setBuilderRows(mappedRows);
    setBuilderOpen(true);
  }

  const columns = useMemo<ColumnDef<RecipeRow>[]>(
    () => [
      {
        header: "SKU formule",
        accessorKey: "code",
        cell: ({ row }) => <span className="font-mono text-[11.5px] text-accent">{row.original.code}</span>,
      },
      { header: "Intitulé", accessorKey: "labelFr" },
      {
        header: "Rendement nominatif",
        accessorFn: (row) => `${row.yieldQtySerialized} ${row.yieldUnit}`,
      },
      { header: "Lignes MP", accessorKey: "ingredientCount" },
      {
        header: "",
        id: "ops",
        cell: ({ row }) => (
          <button
            type="button"
            className="text-[11px] font-semibold text-accent hover:underline"
            onClick={() => openFormulaBuilder(row.original.id).catch(console.error)}
          >
            BOM
          </button>
        ),
      },
    ],
    [],
  );

  async function saveFormulaHeader(): Promise<void> {
    const parsed = productionRecipeUpsertSchema.parse({
      id: draft.id,
      code: draft.code,
      labelFr: draft.labelFr,
      category: draft.category.trim().length === 0 ? null : draft.category.trim(),
      productionNotes: draft.productionNotes.trim().length === 0 ? null : draft.productionNotes.trim(),
      yieldQty: draft.yieldQty,
      yieldUnit: draft.yieldUnit,
      estimatedMinutes:
        draft.estimatedMinutes.trim().length === 0 ? null : Number.parseInt(draft.estimatedMinutes.trim(), 10),
      outputPackagingMaterialId:
        draft.outputPackagingMaterialId.trim().length === 0 ? undefined : draft.outputPackagingMaterialId.trim(),
      isActive: true,
    });
    await samyInvoke(IPC_CHANNELS.PRODUCTION_RECIPE_UPSERT, parsed);
    setEditorOpen(false);
    await reloadRecipeIndex(meta.page).catch(console.error);
  }

  async function synchronizeBom(): Promise<void> {
    if (!activeRecipe) throw new Error("Recette inexistante.");
    const dto = productionRecipeIngredientsReplaceSchema.parse({
      recipeId: activeRecipe.id,
      lines: builderRows
        .filter((row) => row.rawMaterialId.trim())
        .map((row) => ({
          rawMaterialId: row.rawMaterialId,
          quantity: row.quantity,
          unit: row.unit,
          optionalIngredient: row.optionalIngredient,
          wastePct: row.wastePct,
          note: row.note.trim().length ? row.note.trim() : null,
        })),
    });
    await samyInvoke(IPC_CHANNELS.PRODUCTION_RECIPE_INGREDIENTS_REPLACE, dto);
    await reloadRecipeIndex(meta.page).catch(console.error);
    setBuilderOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Nomenclatures glace / parfums"
        subtitle="Structures version-ready : duplication + synchronisation BOM vers lots via PRODUCTION_BATCH."
        actions={
          canWrite ? (
            <button type="button" className="focus-ring border border-accent bg-accent px-3 py-2 text-[12px] font-semibold text-accent-foreground" onClick={() => openNewRecipeSheet().catch(console.error)}>
              <Plus className="mr-2 inline h-4 w-4 align-text-bottom" aria-hidden />
              Déclarer recette
            </button>
          ) : null
        }
      />
      <DataTable columns={columns} data={rows} emptyLabel="Aucune fiche formulée encore." />
      <Pagination meta={meta} onChange={(next) => reloadRecipeIndex(next).catch(console.error)} />

      <Modal title="Référenciation mère" open={editorOpen} onClose={() => setEditorOpen(false)}>
        <div className="space-y-3 text-[12px]">
          <Field label="Code">
            <input className="control-chrome font-mono" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} />
          </Field>
          <Field label="Désignation">
            <input className="control-chrome w-full" value={draft.labelFr} onChange={(event) => setDraft({ ...draft, labelFr: event.target.value })} />
          </Field>
          <Field label="Famille industrielle">
            <input className="control-chrome w-full" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Rendement formulé">
              <input className="control-chrome font-mono" value={draft.yieldQty} onChange={(event) => setDraft({ ...draft, yieldQty: event.target.value })} />
            </Field>
            <Field label="Unité">
              <select className="control-chrome" value={draft.yieldUnit} onChange={(event) => setDraft({ ...draft, yieldUnit: event.target.value as UnitCode })}>
                {(["KG", "G", "L", "ML", "UNIT"] as const).map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Emballage fini (uuid)">
            <input className="control-chrome font-mono" placeholder="Optionnel pour PRODUCTION_IN" value={draft.outputPackagingMaterialId} onChange={(event) => setDraft({ ...draft, outputPackagingMaterialId: event.target.value })} />
          </Field>
          <Field label="Temps nominatif">
            <input className="control-chrome font-mono" value={draft.estimatedMinutes} onChange={(event) => setDraft({ ...draft, estimatedMinutes: event.target.value })} />
          </Field>
          <Field label="Consignes atelier">
            <textarea className="control-chrome min-h-[88px] w-full" value={draft.productionNotes} onChange={(event) => setDraft({ ...draft, productionNotes: event.target.value })} />
          </Field>
          {canWrite ? (
            <button type="button" className="border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground" onClick={() => saveFormulaHeader().catch(console.error)}>
              Valider carte recette
            </button>
          ) : null}
        </div>
      </Modal>

      <Modal title="Répartition matières" open={builderOpen} onClose={() => setBuilderOpen(false)}>
        {activeRecipe ? (
          <div className="space-y-4 text-[12px]">
            <header className="flex flex-wrap items-center justify-between gap-4 border border-border px-4 py-2">
              <div>
                <div className="font-mono text-[11px] text-accent">{activeRecipe.code}</div>
                <div className="text-[13px] font-semibold">{activeRecipe.labelFr}</div>
              </div>
              {canWrite ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="border border-border px-3 py-1 text-[11px] font-semibold"
                    onClick={() =>
                      samyInvoke(IPC_CHANNELS.PRODUCTION_RECIPE_DUPLICATE, {
                        recipeId: activeRecipe.id,
                      })
                        .then(() => reloadRecipeIndex(meta.page))
                        .catch(console.error)
                    }
                  >
                    <Copy className="mr-2 inline h-3 w-3" aria-hidden />
                    Snapshot version
                  </button>
                  <button type="button" className="border border-accent bg-accent px-3 py-1 text-[11px] font-semibold text-accent-foreground" onClick={() => synchronizeBom().catch(console.error)}>
                    Appliquer lignes BOM
                  </button>
                </div>
              ) : null}
            </header>

            <div className="max-h-[360px] space-y-2 overflow-auto rounded border border-border p-3">
              {builderRows.map((row) => (
                <RowEditor
                  key={row.key}
                  row={row}
                  catalog={catalog}
                  onChange={(patch) =>
                    setBuilderRows((previous) => previous.map((candidate) => (candidate.key === row.key ? { ...candidate, ...patch } : candidate)))
                  }
                />
              ))}
            </div>

            {canWrite ? (
              <div className="flex gap-3">
                <button type="button" className="border border-border px-3 py-1 text-[11px]" onClick={() => setBuilderRows((rowsState) => [...rowsState, emptyIngredientRow()])}>
                  Nouvelle ligne
                </button>
                <button
                  type="button"
                  className="border border-border px-3 py-1 text-[11px]"
                  onClick={() => setBuilderRows((rowsState) => (rowsState.length <= 1 ? rowsState : rowsState.slice(0, rowsState.length - 1)))}
                >
                  Supprimer lignes vierges
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function RowEditor(props: { row: BuilderRow; catalog: RawBrief[]; onChange: (patch: Partial<BuilderRow>) => void }) {
  return (
    <div className="grid gap-2 border border-border/70 px-3 py-2 md:grid-cols-[1.35fr_repeat(6,minmax(0,auto))]">
      <select
        className="control-chrome font-mono"
        value={props.row.rawMaterialId}
        onChange={(event) => {
          const nextRaw = props.catalog.find((entry) => entry.id === event.target.value);
          props.onChange({
            rawMaterialId: event.target.value,
            unit: (nextRaw?.unit as UnitCode) ?? props.row.unit,
          });
        }}
      >
        <option value="">Choix matière</option>
        {props.catalog.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.sku} · {entry.labelFr}
          </option>
        ))}
      </select>
      <input className="control-chrome font-mono" placeholder="qty" value={props.row.quantity} onChange={(event) => props.onChange({ quantity: event.target.value })} />
      <select className="control-chrome" value={props.row.unit} onChange={(event) => props.onChange({ unit: event.target.value as UnitCode })}>
        {(["KG", "G", "L", "ML", "UNIT"] as const).map((unit) => (
          <option key={unit}>{unit}</option>
        ))}
      </select>
      <input className="control-chrome font-mono" placeholder="%" value={props.row.wastePct} onChange={(event) => props.onChange({ wastePct: event.target.value })} />
      <label className="flex items-center gap-1 text-[11px] font-semibold">
        <input type="checkbox" checked={props.row.optionalIngredient} onChange={(event) => props.onChange({ optionalIngredient: event.target.checked })} />
        Option
      </label>
      <input className="control-chrome md:col-span-2 font-mono" placeholder="Annotations techniciennes" value={props.row.note} onChange={(event) => props.onChange({ note: event.target.value })} />
    </div>
  );
}

function Pagination(props: { meta: { page: number; pageSize: number; total: number }; onChange: (next: number) => void }) {
  return (
    <div className="flex justify-between text-[11px] text-foreground-muted">
      <button
        type="button"
        disabled={props.meta.page <= 1}
        className="font-semibold text-accent hover:underline disabled:opacity-40"
        onClick={() => props.onChange(props.meta.page - 1)}
      >
        Page précédente
      </button>
      <div>
        Page {props.meta.page} • {props.meta.total} dossiers
      </div>
      <button
        type="button"
        disabled={props.meta.page * props.meta.pageSize >= props.meta.total}
        className="font-semibold text-accent hover:underline disabled:opacity-40"
        onClick={() => props.onChange(props.meta.page + 1)}
      >
        Suite
      </button>
    </div>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-foreground-muted">{props.label}</span>
      {props.children}
    </label>
  );
}
