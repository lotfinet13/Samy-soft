import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { inventorySearchSchema, purchaseCreateSchema } from "@shared/schemas/inventory";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { usePermissions } from "@/hooks/usePermissions";
import { invalidateInventoryCaches } from "@/lib/invalidate-ui-cache";
import { notifySuccess } from "@/lib/notify";
import { invalidateReportsCaches } from "@/lib/invalidate-ui-cache";
import { samyInvoke } from "@/lib/samy";

type SupplierBrief = { id: string; name: string };
type ArticleRow = {
  id: string;
  sku: string;
  labelFr: string;
  unit: string;
};

type LineDraft = {
  key: string;
  materialKind: "RAW" | "PACKAGING";
  rawMaterialId: string;
  packagingMaterialId: string;
  qty: string;
  unitPrice: string;
  expiresAt: string;
};

type PurchaseSummary = {
  id: string;
  purchaseDate: string;
  invoiceRef?: string | null;
  supplier?: { name: string } | null;
  lines: unknown[];
  totalAmountSerialized?: string;
};

type PurchasePageResponse = {
  items: PurchaseSummary[];
  total: number;
  page: number;
  pageSize: number;
};

function toIsoDatetime(valueLocal: string | undefined): string | undefined {
  if (!valueLocal || !valueLocal.trim()) return undefined;
  const dt = new Date(valueLocal);
  if (Number.isNaN(dt.getTime())) throw new Error("Date/heure invalide.");
  return dt.toISOString();
}

function defaultPurchaseLine(): LineDraft {
  return {
    key: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    materialKind: "RAW",
    rawMaterialId: "",
    packagingMaterialId: "",
    qty: "1",
    unitPrice: "0",
    expiresAt: "",
  };
}

export function InventoryPurchasesPage() {
  const { can } = usePermissions();
  const canPurchase = can(PERMISSIONS.INVENTORY_PURCHASE);
  const canRead = can(PERMISSIONS.INVENTORY_READ);

  if (!canRead) {
    return <Navigate to="/" replace />;
  }

  const [list, setList] = useState<PurchaseSummary[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 35 });
  const [listLoading, setListLoading] = useState(true);

  const [suppliers, setSuppliers] = useState<SupplierBrief[]>([]);
  const [rawMaterials, setRawMaterials] = useState<ArticleRow[]>([]);
  const [packMaterials, setPackMaterials] = useState<ArticleRow[]>([]);

  const [supplierId, setSupplierId] = useState("");
  const [purchaseDateLocal, setPurchaseDateLocal] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [notes, setNotes] = useState("");
  const [currencyCode] = useState("DZD");
  const [lines, setLines] = useState<LineDraft[]>([defaultPurchaseLine()]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function reload(page = meta.page): Promise<void> {
    setListLoading(true);
    try {
      const res = await samyInvoke<PurchasePageResponse>(IPC_CHANNELS.INVENTORY_PURCHASE_LIST, {
        page,
        pageSize: meta.pageSize,
      });
      setList(res.items);
      setMeta({ total: res.total, page: res.page, pageSize: res.pageSize });
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await reload(1).catch(console.error);
      const supplierPage = await samyInvoke<{ items: SupplierBrief[] }>(IPC_CHANNELS.INVENTORY_SUPPLIER_LIST, {
        page: 1,
        pageSize: 250,
      });
      setSuppliers(supplierPage.items);

      const rawPayload = inventorySearchSchema.parse({ page: 1, pageSize: 250, includeInactive: false });
      const packPayload = inventorySearchSchema.parse({ page: 1, pageSize: 250, includeInactive: false });

      const [rawRes, pkRes] = await Promise.all([
        samyInvoke<{ items: ArticleRow[] }>(IPC_CHANNELS.INVENTORY_RAW_LIST, rawPayload),
        samyInvoke<{ items: ArticleRow[] }>(IPC_CHANNELS.INVENTORY_PACKAGING_LIST, packPayload),
      ]);
      setRawMaterials(rawRes.items);
      setPackMaterials(pkRes.items);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap données initiales (catalogues)
  }, []);

  async function submitPurchase(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError(null);

    try {
      if (!supplierId.trim()) {
        throw new Error("Choisissez un fournisseur.");
      }

      const purchaseDateIso =
        purchaseDateLocal.trim().length === 0 ? new Date().toISOString() : toIsoDatetime(purchaseDateLocal);

      const parsedLines = lines.map((line) => {
        if (line.materialKind === "RAW" && (!line.rawMaterialId || line.rawMaterialId.length === 0)) {
          throw new Error("Toutes les lignes doivent cibler un article RAW.");
        }

        if (line.materialKind === "PACKAGING" && (!line.packagingMaterialId || line.packagingMaterialId.length === 0)) {
          throw new Error("Toutes les lignes doivent cibler un article d’emballage.");
        }

        return {
          materialKind: line.materialKind,
          rawMaterialId: line.materialKind === "RAW" ? line.rawMaterialId : undefined,
          packagingMaterialId: line.materialKind === "PACKAGING" ? line.packagingMaterialId : undefined,
          qty: line.qty,
          unitPrice: line.unitPrice,
          expiresAt: line.expiresAt.trim().length === 0 ? undefined : toIsoDatetime(line.expiresAt),
        };
      });

      const payload = purchaseCreateSchema.parse({
        supplierId,
        invoiceRef: invoiceRef.trim().length === 0 ? null : invoiceRef.trim(),
        purchaseDate: purchaseDateIso ?? new Date().toISOString(),
        currencyCode,
        notes: notes.trim().length === 0 ? null : notes.trim(),
        lines: parsedLines,
      });

      setSubmitting(true);
      await samyInvoke(IPC_CHANNELS.INVENTORY_PURCHASE_CREATE, payload);
      invalidateInventoryCaches();
      invalidateReportsCaches();
      notifySuccess("Bon d'achat enregistré — stock mis à jour.");
      setSupplierId("");
      setPurchaseDateLocal("");
      setInvoiceRef("");
      setNotes("");
      setLines([defaultPurchaseLine()]);
      await reload(1).catch(console.error);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function updateLine(key: string, patch: Partial<LineDraft>): void {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine(): void {
    setLines((prev) => [...prev, defaultPurchaseLine()]);
  }

  function removeLine(key: string): void {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((line) => line.key !== key)));
  }

  const columns = useMemo<ColumnDef<PurchaseSummary>[]>(
    () => [
      {
        header: "Date",
        accessorKey: "purchaseDate",
        cell: ({ row }) => (
          <span className="font-mono text-[11.6px]">
            {new Intl.DateTimeFormat("fr-DZ", { dateStyle: "short", timeStyle: "short" }).format(
              new Date(row.original.purchaseDate),
            )}
          </span>
        ),
      },
      { header: "Fournisseur", accessorFn: (row) => row.supplier?.name ?? "—" },
      { header: "Facture", accessorFn: (row) => row.invoiceRef || "—" },
      {
        header: "Lignes",
        accessorFn: (row) => row.lines.length,
      },
      {
        header: "Total",
        accessorFn: (row) => row.totalAmountSerialized ?? "—",
        cell: ({ row }) => <span className="font-mono text-accent">{row.original.totalAmountSerialized ?? "—"}</span>,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Réceptions acheteurs"
        subtitle="Bon d’entrée acheteur : chaque ligne génère un mouvement PURCHASE_IN et met à jour le coût moyen."
      />

      {canPurchase ? (
        <section className="border border-border bg-surface-muted/35 p-4" data-testid="purchase-form">
          <header className="mb-4 border-b border-border pb-3 text-[12px] font-semibold uppercase tracking-wide text-foreground-muted">
            Nouveau bon d&apos;entrée acheteur
          </header>
          <form className="flex flex-col gap-4" data-testid="purchase-modal-form" onSubmit={(event) => void submitPurchase(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Fournisseur" description="Référencé sur la table fournisseur.">
                <select
                  className="control-chrome w-full"
                  data-testid="purchase-modal-supplier"
                  required
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                >
                  <option value="">— Sélectionnez —</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Date / heure du bon">
                <input
                  type="datetime-local"
                  className="control-chrome w-full font-mono"
                  value={purchaseDateLocal}
                  onChange={(event) => setPurchaseDateLocal(event.target.value)}
                  placeholder=""
                />
                <span className="text-[11px] text-foreground-muted">Si vide : horodatage courant lors de la validation.</span>
              </FormField>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Réf. facture / BL">
                <input className="control-chrome w-full font-mono" value={invoiceRef} onChange={(event) => setInvoiceRef(event.target.value)} />
              </FormField>
              <FormField label="Notes internes">
                <textarea className="control-chrome min-h-[68px] w-full" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </FormField>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="text-[12px] font-semibold text-foreground-muted">Lignes du bon ({lines.length})</div>
              <button
                type="button"
                className="focus-ring border border-border bg-surface-muted px-3 py-2 text-[12px] font-semibold hover:bg-surface"
                onClick={() => addLine()}
              >
                Ajouter ligne
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {lines.map((line) => (
                <div key={line.key} className="grid gap-3 border border-border bg-surface-elevated p-3 lg:grid-cols-[repeat(6,minmax(0,1fr))]">
                  <FormField label="Type">
                    <select
                      className="control-chrome w-full"
                      value={line.materialKind}
                      onChange={(event) =>
                        updateLine(line.key, { materialKind: event.target.value as "RAW" | "PACKAGING" })
                      }
                    >
                      <option value="RAW">Matière</option>
                      <option value="PACKAGING">Emballage</option>
                    </select>
                  </FormField>

                  <FormField label={line.materialKind === "RAW" ? "Matière" : "Article"} description="SKU figé lors de la saisie.">
                    <select
                      className="control-chrome w-full font-mono"
                      data-testid="purchase-modal-line-material"
                      required
                      value={line.materialKind === "RAW" ? line.rawMaterialId : line.packagingMaterialId}
                      onChange={(event) => {
                        const value = event.target.value;
                        updateLine(line.key, {
                          rawMaterialId: line.materialKind === "RAW" ? value : "",
                          packagingMaterialId: line.materialKind === "PACKAGING" ? value : "",
                        });
                      }}
                    >
                      <option value="">—</option>
                      {(line.materialKind === "RAW" ? rawMaterials : packMaterials).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.sku} · {item.labelFr}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Qté">
                    <input
                      className="control-chrome w-full font-mono"
                      inputMode="decimal"
                      required
                      value={line.qty}
                      onChange={(event) => updateLine(line.key, { qty: event.target.value })}
                    />
                  </FormField>

                  <FormField label="P.U. hors taxe">
                    <input
                      className="control-chrome w-full font-mono"
                      inputMode="decimal"
                      required
                      value={line.unitPrice}
                      onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                    />
                  </FormField>

                  <FormField label="DLC (réception)" description="Optionnel pour contrôle péremption.">
                    <input
                      type="datetime-local"
                      className="control-chrome w-full font-mono"
                      value={line.expiresAt}
                      onChange={(event) => updateLine(line.key, { expiresAt: event.target.value })}
                    />
                  </FormField>

                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      aria-label="Supprimer la ligne"
                      className="focus-ring inline-flex min-h-touch min-w-touch items-center justify-center border border-border bg-surface-muted text-danger hover:bg-danger/10 disabled:opacity-40"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length <= 1}
                    >
                      <Trash2 className="h-[16px] w-[16px]" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {submitError ? (
              <p className="border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] font-semibold text-danger" data-testid="purchase-modal-error">{submitError}</p>
            ) : null}

            <button
              type="submit"
              data-testid="purchase-modal-submit"
              disabled={submitting || lines.length === 0}
              className="focus-ring border border-accent bg-accent py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Enregistrement…" : "Valider entrée acheteur (mouvements PURCHASE_IN)"}
            </button>
          </form>
        </section>
      ) : (
        <p className="border border-border bg-surface-muted/60 px-3 py-2 text-[12px] text-foreground-muted">
          Permission acheteurs requise (<code className="font-mono text-[11px]">inventory.purchase</code>) pour enregistrer un bon.
          Consultez l’historique ci-dessous.
        </p>
      )}

      <section className="flex flex-col gap-4">
        <header className="text-[13px] font-semibold uppercase tracking-wide text-foreground-muted">Journal des bons</header>
        <DataTable columns={columns} data={list} loading={listLoading} emptyLabel="Aucun bon d’achat encore enregistré." />
        <div className="flex justify-between gap-4 text-[11px] text-foreground-muted">
          <button
            type="button"
            disabled={meta.page <= 1}
            className="font-semibold text-accent hover:underline disabled:opacity-40"
            onClick={() => reload(meta.page - 1).catch(console.error)}
          >
            Page précédente
          </button>
          <div>
            Page {meta.page} — {meta.total} bons
          </div>
          <button
            type="button"
            disabled={meta.page * meta.pageSize >= meta.total}
            className="font-semibold text-accent hover:underline disabled:opacity-40"
            onClick={() => reload(meta.page + 1).catch(console.error)}
          >
            Page suivante
          </button>
        </div>
      </section>
    </div>
  );
}
