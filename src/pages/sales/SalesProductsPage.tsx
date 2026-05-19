import { zodResolver } from "@hookform/resolvers/zod";
import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { productUpsertSchema } from "@shared/schemas/sales";
import type { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { DataTable } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { InlineProductPriceCell } from "@/components/sales/InlineProductPriceCell";
import { usePermissions } from "@/hooks/usePermissions";
import { invalidateInventoryCaches, invalidateSalesCaches } from "@/lib/invalidate-ui-cache";
import { samyInvoke } from "@/lib/samy";

type FormValues = z.input<typeof productUpsertSchema>;

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  sellingPriceSerialized: string;
  unit: string;
  isActive: boolean;
  stockQtySerialized: string | null;
  packagingMaterial: { sku: string; labelFr: string } | null;
  recipe: { code: string; labelFr: string } | null;
};

type Brief = { id: string; sku?: string; labelFr?: string; code?: string };

function emptyProduct(): FormValues {
  return {
    sku: "",
    name: "",
    category: null,
    sellingPrice: "0",
    unit: "UNIT",
    recipeId: null,
    packagingMaterialId: null,
    barcode: null,
    notes: null,
    isActive: true,
  };
}

export function SalesProductsPage() {
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.SALES_WRITE);

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 40 });
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [packagingOptions, setPackagingOptions] = useState<Brief[]>([]);
  const [recipeOptions, setRecipeOptions] = useState<Brief[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(productUpsertSchema),
    defaultValues: emptyProduct(),
  });

  async function reload(page = 1): Promise<void> {
    const res = await samyInvoke<{ items: ProductRow[]; total: number }>(IPC_CHANNELS.SALES_PRODUCT_LIST, {
      page,
      pageSize: meta.pageSize,
      q,
      includeInactive: true,
    });
    setRows(res.items);
    setMeta({ total: res.total, page, pageSize: meta.pageSize });
  }

  useEffect(() => {
    void reload(1).catch(console.error);
    void samyInvoke<{ items: Brief[] }>(IPC_CHANNELS.INVENTORY_PACKAGING_LIST, {
      page: 1,
      pageSize: 500,
      q: "",
      includeInactive: false,
    }).then((r) => setPackagingOptions(r.items.map((i) => ({ id: i.id, sku: i.sku, labelFr: i.labelFr }))));
    void samyInvoke<{ items: Brief[] }>(IPC_CHANNELS.PRODUCTION_RECIPE_LIST, {
      page: 1,
      pageSize: 500,
      q: "",
      includeInactive: false,
    })
      .then((r) => setRecipeOptions(r.items.map((i) => ({ id: i.id, code: i.code, labelFr: i.labelFr }))))
      .catch((err) => {
        console.error("[sales-products] recipe options", err);
        setRecipeOptions([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew(): void {
    form.reset(emptyProduct());
    setModalOpen(true);
  }

  async function openEdit(row: ProductRow): Promise<void> {
    const detail = await samyInvoke<{
      id: string;
      sku: string;
      name: string;
      category: string | null;
      sellingPriceSerialized: string;
      unit: FormValues["unit"];
      recipeId: string | null;
      packagingMaterialId: string | null;
      barcode: string | null;
      notes: string | null;
      isActive: boolean;
    }>(IPC_CHANNELS.SALES_PRODUCT_GET, row.id);
    form.reset({
      id: detail.id,
      sku: detail.sku,
      name: detail.name,
      category: detail.category,
      sellingPrice: detail.sellingPriceSerialized,
      unit: detail.unit,
      recipeId: detail.recipeId,
      packagingMaterialId: detail.packagingMaterialId,
      barcode: detail.barcode,
      notes: detail.notes,
      isActive: detail.isActive,
    });
    setModalOpen(true);
  }

  async function onSubmit(values: FormValues): Promise<void> {
    await samyInvoke(IPC_CHANNELS.SALES_PRODUCT_UPSERT, values);
    invalidateSalesCaches();
    invalidateInventoryCaches();
    setModalOpen(false);
    await reload(meta.page);
  }

  const columns = useMemo<ColumnDef<ProductRow>[]>(
    () => [
      {
        header: "SKU",
        accessorKey: "sku",
        cell: ({ row }) => (
          <button
            type="button"
            className="font-mono text-[11px] text-accent hover:underline"
            onClick={() => void openEdit(row.original)}
          >
            {row.original.sku}
          </button>
        ),
      },
      { header: "Produit", accessorKey: "name" },
      {
        header: "Prix",
        accessorFn: (r) => r.sellingPriceSerialized,
        cell: ({ row }) => (
          <InlineProductPriceCell
            productId={row.original.id}
            label={row.original.name}
            sellingPriceSerialized={row.original.sellingPriceSerialized}
            disabled={!canWrite}
            onSaved={async () => {
              invalidateSalesCaches();
              invalidateInventoryCaches();
              await reload(meta.page);
            }}
          />
        ),
      },
      {
        header: "Stock",
        accessorKey: "stockQtySerialized",
        cell: ({ row }) => row.original.stockQtySerialized ?? "—",
      },
      {
        header: "Emballage",
        accessorFn: (r) => r.packagingMaterial?.sku ?? "—",
      },
      {
        header: "Actif",
        accessorKey: "isActive",
        cell: ({ row }) => (row.original.isActive ? "Oui" : "Non"),
      },
    ],
    [canWrite, meta.page],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Catalogue produits finis"
        subtitle="SKU prix, lien recette/emballage pour déstockage SALES_OUT au grand-livre."
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Recherche
          <input
            className="control-chrome h-9 min-w-[200px] px-2 text-[13px]"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void reload(1);
            }}
          />
        </label>
        <button type="button" className="btn-primary h-9 px-3 text-[12px]" onClick={() => void reload(1)}>
          Filtrer
        </button>
        {canWrite ? (
          <button type="button" className="btn-secondary inline-flex h-9 items-center gap-2 px-3 text-[12px]" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nouveau produit
          </button>
        ) : null}
      </div>

      <DataTable columns={columns} data={rows} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Produit">
        <form className="flex max-h-[85vh] flex-col gap-3 overflow-auto p-1" onSubmit={form.handleSubmit((v) => void onSubmit(v))}>
          <input type="hidden" {...form.register("id")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="SKU *" error={form.formState.errors.sku?.message}>
              <input className="control-chrome h-9 w-full px-2 font-mono text-[13px]" {...form.register("sku")} />
            </FormField>
            <FormField label="Nom *" error={form.formState.errors.name?.message}>
              <input className="control-chrome h-9 w-full px-2 text-[13px]" {...form.register("name")} />
            </FormField>
            <FormField label="Catégorie" error={form.formState.errors.category?.message}>
              <input className="control-chrome h-9 w-full px-2 text-[13px]" {...form.register("category")} />
            </FormField>
            <FormField label="Prix vente *" error={form.formState.errors.sellingPrice?.message}>
              <input className="control-chrome h-9 w-full px-2 text-[13px]" {...form.register("sellingPrice")} />
            </FormField>
            <FormField label="Unité" error={form.formState.errors.unit?.message}>
              <select className="control-chrome h-9 w-full px-2 text-[13px]" {...form.register("unit")}>
                {(["KG", "G", "L", "ML", "UNIT"] as const).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Code-barres (futur POS)" error={form.formState.errors.barcode?.message}>
              <input className="control-chrome h-9 w-full px-2 font-mono text-[13px]" {...form.register("barcode")} />
            </FormField>
            <FormField label="Emballage stock * (déstockage)" error={form.formState.errors.packagingMaterialId?.message}>
              <select className="control-chrome h-9 w-full px-2 text-[12px]" {...form.register("packagingMaterialId")}>
                <option value="">—</option>
                {packagingOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.labelFr}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Recette (optionnel)" error={form.formState.errors.recipeId?.message}>
              <select className="control-chrome h-9 w-full px-2 text-[12px]" {...form.register("recipeId")}>
                <option value="">—</option>
                {recipeOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.labelFr}
                  </option>
                ))}
              </select>
            </FormField>
            <label className="flex items-center gap-2 text-[12px] font-semibold">
              <input type="checkbox" {...form.register("isActive")} />
              Actif
            </label>
          </div>
          <FormField label="Notes" error={form.formState.errors.notes?.message}>
            <textarea className="control-chrome min-h-[60px] w-full px-2 py-1.5 text-[13px]" {...form.register("notes")} />
          </FormField>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button type="button" className="btn-secondary h-9 px-3 text-[12px]" onClick={() => setModalOpen(false)}>
              Annuler
            </button>
            <button type="submit" className="btn-primary h-9 px-3 text-[12px]" disabled={form.formState.isSubmitting}>
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
