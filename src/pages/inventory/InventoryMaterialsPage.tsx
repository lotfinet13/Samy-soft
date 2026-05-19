import { zodResolver } from "@hookform/resolvers/zod";
import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { inventorySearchSchema, rawMaterialUpsertSchema } from "@shared/schemas/inventory";
import type { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { InlineInventoryQtyCell } from "@/components/inventory/InlineInventoryQtyCell";
import { Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { useOperationalFilters } from "@/hooks/useOperationalFilters";
import { usePermissions } from "@/hooks/usePermissions";
import { invalidateInventoryCaches } from "@/lib/invalidate-ui-cache";
import { samyInvoke } from "@/lib/samy";
import { useToastStore } from "@/stores/toast-store";

type FormValues = z.input<typeof rawMaterialUpsertSchema>;

type RawListResponse = {
  items: InventoryRow[];
  total: number;
  page: number;
  pageSize: number;
};

type InventoryRow = {
  id: string;
  sku: string;
  labelFr: string;
  category?: string | null;
  unit: string;
  minimumStockQty: string;
  costPriceUnit: string;
  isActive?: boolean | null;
  expirationTracking?: boolean | null;
  expiryWarningDays?: number | null;
  notes?: string | null;
  supplierId?: string | null;
  supplier?: { name: string } | null;
  currentQtySerialized: string;
  isLowStock: boolean;
};

type SupplierBrief = {
  id: string;
  name: string;
};

export function InventoryMaterialsPage(props: { mode: "RAW" | "PACKAGING" }) {
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.INVENTORY_WRITE);
  const canAdjust = can(PERMISSIONS.INVENTORY_ADJUST);
  const pushToast = useToastStore((t) => t.push);
  const channelList =
    props.mode === "RAW" ? IPC_CHANNELS.INVENTORY_RAW_LIST : IPC_CHANNELS.INVENTORY_PACKAGING_LIST;
  const channelUpsert =
    props.mode === "RAW" ? IPC_CHANNELS.INVENTORY_RAW_UPSERT : IPC_CHANNELS.INVENTORY_PACKAGING_UPSERT;

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 40 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierBrief[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const filterNs = props.mode === "RAW" ? "inventory-raw-materials" : "inventory-packaging";
  const { chips, pushRecent, savePreset, removePreset } = useOperationalFilters(filterNs);
  const [presetName, setPresetName] = useState("");

  async function reload(page = meta.page, qOverride?: string): Promise<void> {
    const qs = qOverride !== undefined ? qOverride : q;
    const payload = inventorySearchSchema.parse({
      q: qs,
      page,
      pageSize: meta.pageSize,
      includeInactive: false,
    });
    setLoading(true);
    try {
      const res = await samyInvoke<RawListResponse>(channelList, payload);
      setRows(res.items);
      setMeta({ total: res.total, page: res.page, pageSize: res.pageSize });
    } catch {
      /* toast affiché par samyInvoke */
    } finally {
      setLoading(false);
    }
  }

  async function doSearch(trackRecent: boolean): Promise<void> {
    if (trackRecent && q.trim().length >= 2) pushRecent(q.trim());
    await reload(1);
  }

  useEffect(() => {
    void reload(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- liste initiale puis pagination / recherche manuelle
  }, []);

  useEffect(() => {
    void (async () => {
      const supplierPage = await samyInvoke<{ items: SupplierBrief[] }>(IPC_CHANNELS.INVENTORY_SUPPLIER_LIST, {
        page: 1,
        pageSize: 200,
      });
      setSuppliers(supplierPage.items);
    })();
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(rawMaterialUpsertSchema),
    defaultValues: defaultForm(),
  });

  function openModal(row?: InventoryRow): void {
    if (!row) {
      form.reset(defaultForm());
    } else {
      form.reset({
        id: row.id,
        sku: row.sku,
        labelFr: row.labelFr,
        category: row.category ?? null,
        unit: row.unit as FormValues["unit"],
        minimumStockQty: row.minimumStockQty,
        costPriceUnit: row.costPriceUnit,
        expirationTracking: Boolean(row.expirationTracking),
        expiryWarningDays: row.expiryWarningDays ?? null,
        notes: row.notes ?? null,
        isActive: Boolean(row.isActive),
        supplierId: row.supplierId && row.supplierId.length > 0 ? row.supplierId : null,
      });
    }
    setModalOpen(true);
  }

  const columns = useMemo<ColumnDef<InventoryRow>[]>(
    () => [
      {
        header: "SKU",
        accessorKey: "sku",
        cell: ({ row }) => <span className="font-mono text-[11.5px]">{row.original.sku}</span>,
      },
      { header: "Désignation", accessorKey: "labelFr" },
      {
        header: "Qté phy.",
        accessorFn: (r) => r.currentQtySerialized,
        cell: ({ row }) => (
          <InlineInventoryQtyCell
            materialKind={props.mode === "RAW" ? "RAW" : "PACKAGING"}
            materialId={row.original.id}
            displayQtySerialized={row.original.currentQtySerialized}
            isLowStock={row.original.isLowStock}
            disabled={!canAdjust}
            onCommitted={async () => {
              invalidateInventoryCaches();
              await reload(meta.page).catch(console.error);
            }}
          />
        ),
      },
      {
        header: "Seuil",
        accessorFn: (row) => row.minimumStockQty,
      },
      { header: "Unité", accessorKey: "unit" },
      {
        header: "Fournisseur",
        accessorFn: (row) => row.supplier?.name ?? "—",
      },
      {
        header: "",
        id: "rowMenu",
        cell: ({ row }) => (
          <RowActionsMenu
            dense
            actions={[
              ...(canWrite
                ? [
                    {
                      id: "edit",
                      label: "Fiche complète",
                      onSelect: () => openModal(row.original),
                    },
                  ]
                : []),
              {
                id: "copySku",
                label: "Copier SKU",
                onSelect: () => {
                  void navigator.clipboard
                    .writeText(row.original.sku)
                    .then(() => pushToast("success", "SKU copié."))
                    .catch(() => pushToast("error", "Presse-papiers indisponible."));
                },
              },
            ]}
          />
        ),
      },
    ],
    [canAdjust, canWrite, meta.page, props.mode, pushToast],
  );

  async function submit(values: FormValues): Promise<void> {
    const ew = values.expiryWarningDays as number | string | null | undefined;
    let expiryWarningDays: number | null = null;
    if (ew !== undefined && ew !== null) {
      if (typeof ew === "string") {
        const trimmed = ew.trim();
        expiryWarningDays = trimmed.length === 0 ? null : Number.parseInt(trimmed, 10);
        if (!Number.isFinite(expiryWarningDays)) expiryWarningDays = null;
      } else if (typeof ew === "number") {
        expiryWarningDays = Number.isFinite(ew) ? ew : null;
      }
    }

    const normalized = {
      ...values,
      supplierId: values.supplierId && String(values.supplierId).trim().length > 0 ? values.supplierId : null,
      category: values.category?.trim()?.length ? values.category.trim() : null,
      notes: values.notes?.trim()?.length ? values.notes.trim() : null,
      expiryWarningDays,
    };

    const parsed = rawMaterialUpsertSchema.parse(normalized);
    const isNew = !parsed.id;
    await samyInvoke(channelUpsert, parsed);
    invalidateInventoryCaches();
    setModalOpen(false);
    pushToast("success", "Fiche enregistrée.");
    if (isNew && parsed.sku.trim().length > 0) {
      setQ(parsed.sku);
      await reload(1, parsed.sku);
    } else {
      setQ("");
      const pageAfterCreate = Math.max(1, Math.ceil((meta.total + 1) / meta.pageSize));
      await reload(pageAfterCreate, "");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={props.mode === "RAW" ? "Matières premières" : "Articles d’emballage"}
        subtitle="Tout changement physique transite ensuite par mouvements / achats ; ce formulaire décrit uniquement les fiches article."
        actions={
          canWrite ? (
            <button
              type="button"
              className="focus-ring inline-flex min-h-touch items-center gap-2 border border-accent bg-accent px-3 py-2 text-[12px] font-semibold text-accent-foreground hover:opacity-95"
              data-testid="material-modal-open"
              onClick={() => openModal()}
            >
              <Plus className="h-[15px] w-[15px]" aria-hidden /> Nouvelle fiche
            </button>
          ) : null
        }
      />

      {q.trim().length > 0 ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] font-semibold text-warning-foreground">
          Filtre actif : « {q.trim()} » — seuls les articles correspondants sont affichés.{" "}
          <button
            type="button"
            className="underline hover:opacity-90"
            onClick={() => {
              setQ("");
              void reload(1, "");
            }}
          >
            Tout afficher
          </button>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="SKU / désignation"
          className="control-chrome w-64 font-mono"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void doSearch(true);
          }}
        />
        <button
          type="button"
          className="focus-ring border border-border bg-surface-muted px-3 py-1.5 text-[12px] font-semibold hover:bg-surface"
          onClick={() => void doSearch(true)}
        >
          Rechercher
        </button>
        <button
          type="button"
          className="focus-ring border border-border bg-surface-muted px-3 py-1.5 text-[12px] font-semibold hover:bg-surface"
          onClick={() => {
            setQ("");
            void reload(1, "").catch(console.error);
          }}
        >
          Réinitialiser
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-1 text-[11px]">
          <input
            className="control-chrome w-36 px-2 py-1 font-mono"
            placeholder="Nom filtre"
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
          />
          <button
            type="button"
            className="border border-border px-2 py-1 font-semibold hover:bg-surface-muted"
            onClick={() => {
              savePreset(presetName || q.trim() || "Principal", q);
              setPresetName("");
            }}
          >
            Mémoriser recherche
          </button>
        </div>
      </div>

      {chips.length ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-semibold text-foreground-muted">Filtres & récents :</span>
          {chips.map((c) => (
            <span key={`${c.kind}-${c.label}`} className="inline-flex items-center gap-0.5">
              <button
                type="button"
                className="rounded-full border border-border bg-surface-muted px-2 py-0.5 font-semibold hover:bg-surface"
                onClick={() => {
            setQ(c.query);
            void reload(1, c.query).catch(console.error);
          }}
              >
                {c.kind === "saved" ? `★ ${c.label}` : c.label}
              </button>
              {c.kind === "saved" ? (
                <button
                  type="button"
                  className="px-1 font-mono text-foreground-muted hover:text-danger"
                  aria-label={`Supprimer le filtre ${c.label}`}
                  onClick={() => removePreset(c.label)}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <DataTable columns={columns} data={rows} loading={loading} emptyLabel="Aucun article inventoriable." />

      <div className="flex justify-between gap-4 text-[11px] text-foreground-muted">
        <button
          type="button"
          className="font-semibold text-accent hover:underline disabled:opacity-40"
          disabled={meta.page <= 1}
          onClick={() => reload(meta.page - 1).catch(console.error)}
        >
          Page précédente
        </button>
        <div>
          Page {meta.page} — {meta.total} articles
        </div>
        <button
          type="button"
          className="font-semibold text-accent hover:underline disabled:opacity-40"
          disabled={meta.page * meta.pageSize >= meta.total}
          onClick={() => reload(meta.page + 1).catch(console.error)}
        >
          Page suivante
        </button>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          form.reset(defaultForm());
        }}
        testId="material-modal"
        title={form.getValues("id") ? "Mettre à jour la fiche" : "Créer une fiche"}
        footer={
          <button
            type="button"
            className="focus-ring border border-border bg-surface-muted px-3 py-2 text-[12px] font-semibold"
            onClick={() => setModalOpen(false)}
          >
            Fermer
          </button>
        }
      >
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="SKU" error={form.formState.errors.sku?.message}>
              <input className="control-chrome w-full font-mono" data-testid="material-modal-sku" {...form.register("sku")} />
            </FormField>
            <FormField label="Désignation" error={form.formState.errors.labelFr?.message}>
              <input className="control-chrome w-full" data-testid="material-modal-label" {...form.register("labelFr")} />
            </FormField>
          </div>
          <FormField label="Catégorie">
            <input className="control-chrome w-full" {...form.register("category")} placeholder="Ingédient · emballage…" />
          </FormField>
          <FormField label="Unité métier">
            <select className="control-chrome w-full" {...form.register("unit")}>
              {["KG", "G", "L", "ML", "UNIT"].map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Seuil critique" error={form.formState.errors.minimumStockQty?.message}>
              <input className="control-chrome w-full font-mono" {...form.register("minimumStockQty")} />
            </FormField>
            <FormField label="Coût unitaire snapshot" error={form.formState.errors.costPriceUnit?.message}>
              <input className="control-chrome w-full font-mono" {...form.register("costPriceUnit")} />
            </FormField>
          </div>

          <FormField label="Fournisseur défaut">
            <select className="control-chrome w-full" {...form.register("supplierId")}> 
              <option value="">—</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </FormField>

          <label className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
            <input type="checkbox" {...form.register("expirationTracking")} /> Suivi d’expiration
          </label>
          <FormField label="Jours avant alerte DLC">
            <input className="control-chrome w-full font-mono" type="number" {...form.register("expiryWarningDays")} />
          </FormField>
          <FormField label="Notes">
            <textarea className="control-chrome min-h-[84px] w-full" {...form.register("notes")} />
          </FormField>

          <label className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
            <input type="checkbox" {...form.register("isActive")} /> Actif
          </label>

          {canWrite ? (
            <button
              type="submit"
              data-testid="material-modal-submit"
              className="focus-ring w-full border border-accent bg-accent py-2 text-[12px] font-semibold text-accent-foreground"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Enregistrement…" : "Enregistrer fiche"}
            </button>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}

function defaultForm(): FormValues {
  return {
    sku: "",
    labelFr: "",
    category: null,
    unit: "KG",
    minimumStockQty: "0",
    costPriceUnit: "0",
    expirationTracking: false,
    expiryWarningDays: null,
    notes: null,
    isActive: true,
    supplierId: null,
  };
}
