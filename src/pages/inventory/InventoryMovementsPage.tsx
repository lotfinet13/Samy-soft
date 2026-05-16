import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { inboundMovementSchema, inventorySearchSchema, manualAdjustmentSchema, outboundMovementSchema } from "@shared/schemas/inventory";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { DataTable } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { invalidateInventoryCaches } from "@/lib/invalidate-ui-cache";
import { samyInvoke } from "@/lib/samy";

type ArticleRow = {
  id: string;
  sku: string;
  labelFr: string;
};

type MovementRow = {
  id: string;
  inventoryKind: string;
  materialLabel?: string;
  materialSku?: string;
  qtySignedSerialized?: string;
  qtyBeforeSerialized?: string;
  qtyAfterSerialized?: string;
  occurredAtISO: string;
  actor?: string;
  note?: string | null;
};

type MovementListResponse = {
  items: MovementRow[];
  total: number;
  page: number;
  pageSize: number;
};

function toIsoOptional(datetimeLocal: string): string | undefined {
  const trimmed = datetimeLocal.trim();
  if (!trimmed) return undefined;
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) throw new Error("Date/heure opération invalide.");
  return dt.toISOString();
}

const OUTBOUND_KINDS = ["PRODUCTION_OUT", "SALES_OUT", "DAMAGED_LOSS", "EXPIRED_LOSS", "PRODUCTION_WASTE"] as const;

const INBOUND_KINDS = ["RETURN_IN", "PRODUCTION_IN"] as const;

export function InventoryMovementsPage() {
  const { can } = usePermissions();
  const canRead = can(PERMISSIONS.INVENTORY_READ);
  const canAdjust = can(PERMISSIONS.INVENTORY_ADJUST);

  type PanelTabId = "list" | "outbound" | "inbound" | "adjust";

  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 40 });
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [rawMaterials, setRawMaterials] = useState<ArticleRow[]>([]);
  const [packMaterials, setPackMaterials] = useState<ArticleRow[]>([]);
  const [panel, setPanel] = useState<PanelTabId>("list");
  const [status, setStatus] = useState<string | null>(null);
  const [busyTab, setBusyTab] = useState<Exclude<PanelTabId, "list"> | null>(null);

  const [outbound, setOutbound] = useState({
    inventoryKind: OUTBOUND_KINDS[0] as (typeof OUTBOUND_KINDS)[number],
    materialKind: "RAW" as "RAW" | "PACKAGING",
    rawMaterialId: "",
    packagingMaterialId: "",
    qtyOut: "1",
    occurredAtLocal: "",
    note: "",
  });

  const [inbound, setInbound] = useState({
    inventoryKind: INBOUND_KINDS[0] as (typeof INBOUND_KINDS)[number],
    materialKind: "RAW" as "RAW" | "PACKAGING",
    rawMaterialId: "",
    packagingMaterialId: "",
    qtyIn: "1",
    occurredAtLocal: "",
    note: "",
  });

  const [adjust, setAdjust] = useState({
    materialKind: "RAW" as "RAW" | "PACKAGING",
    rawMaterialId: "",
    packagingMaterialId: "",
    targetQty: "0",
    occurredAtLocal: "",
    note: "",
  });

  async function reloadMovements(page = meta.page): Promise<void> {
    const paging = inventorySearchSchema.parse({ page, pageSize: meta.pageSize, q: "", includeInactive: false });
    const pagingOnly = { page: paging.page, pageSize: paging.pageSize };
    const res = await samyInvoke<MovementListResponse>(IPC_CHANNELS.INVENTORY_MOVEMENT_LIST, pagingOnly);
    setRows(res.items as MovementRow[]);
    setMeta({ total: res.total, page: res.page, pageSize: res.pageSize });
  }

  useEffect(() => {
    if (!canRead) return undefined;
    void (async () => {
      await reloadMovements(1).catch(console.error);
      const rawPayload = inventorySearchSchema.parse({ page: 1, pageSize: 250, includeInactive: false });
      const pkPayload = inventorySearchSchema.parse({ page: 1, pageSize: 250, includeInactive: false });
      const [rawRes, pkRes] = await Promise.all([
        samyInvoke<{ items: ArticleRow[] }>(IPC_CHANNELS.INVENTORY_RAW_LIST, rawPayload),
        samyInvoke<{ items: ArticleRow[] }>(IPC_CHANNELS.INVENTORY_PACKAGING_LIST, pkPayload),
      ]);
      setRawMaterials(rawRes.items);
      setPackMaterials(pkRes.items);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement catalogue + journal (pagination manuelle ensuite)
    return undefined;
  }, [canRead]);

  if (!canRead) {
    return <Navigate to="/" replace />;
  }

  const columns = useMemo<ColumnDef<MovementRow>[]>(
    () => [
      {
        header: "Date",
        accessorKey: "occurredAtISO",
        cell: ({ row }) => (
          <span className="font-mono text-[11.4px]">
            {new Intl.DateTimeFormat("fr-DZ", { dateStyle: "short", timeStyle: "short" }).format(
              new Date(row.original.occurredAtISO),
            )}
          </span>
        ),
      },
      {
        header: "Type",
        accessorKey: "inventoryKind",
      },
      {
        header: "Article",
        accessorFn: (row) => row.materialLabel ?? "—",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-semibold">{row.original.materialLabel}</span>
            <span className="font-mono text-[11px] text-foreground-muted">{row.original.materialSku ?? "—"}</span>
          </div>
        ),
      },
      {
        header: "Δ qty",
        accessorKey: "qtySignedSerialized",
        cell: ({ row }) => <span className="font-mono text-[11.8px]">{row.original.qtySignedSerialized ?? "—"}</span>,
      },
      {
        header: "Avant → Après",
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-foreground-muted">
            {row.original.qtyBeforeSerialized ?? "—"} → {row.original.qtyAfterSerialized ?? "—"}
          </span>
        ),
      },
      {
        header: "Opérateur",
        accessorKey: "actor",
      },
      {
        header: "Note",
        accessorKey: "note",
        cell: ({ row }) => <span className="text-[11.5px] text-foreground-muted">{row.original.note ?? "—"}</span>,
      },
    ],
    [],
  );

  async function submitOutbound(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canAdjust) return;
    setBusyTab("outbound");
    setStatus(null);
    try {
      const dto = outboundMovementSchema.parse({
        inventoryKind: outbound.inventoryKind,
        materialKind: outbound.materialKind,
        rawMaterialId: outbound.materialKind === "RAW" ? outbound.rawMaterialId : undefined,
        packagingMaterialId: outbound.materialKind === "PACKAGING" ? outbound.packagingMaterialId : undefined,
        qtyOut: outbound.qtyOut,
        occurredAt: toIsoOptional(outbound.occurredAtLocal),
        note: outbound.note.trim().length === 0 ? null : outbound.note.trim(),
      });
      await samyInvoke(IPC_CHANNELS.INVENTORY_MOVEMENT_OUTBOUND, dto);
      invalidateInventoryCaches();
      setStatus("SUCCÈS — Sortie industrielle persistée.");
      await reloadMovements(meta.page).catch(console.error);
      setOutbound((prev) => ({ ...prev, qtyOut: "1", note: "", occurredAtLocal: "" }));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyTab(null);
    }
  }

  async function submitInbound(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canAdjust) return;
    setBusyTab("inbound");
    setStatus(null);
    try {
      const dto = inboundMovementSchema.parse({
        inventoryKind: inbound.inventoryKind,
        materialKind: inbound.materialKind,
        rawMaterialId: inbound.materialKind === "RAW" ? inbound.rawMaterialId : undefined,
        packagingMaterialId: inbound.materialKind === "PACKAGING" ? inbound.packagingMaterialId : undefined,
        qtyIn: inbound.qtyIn,
        occurredAt: toIsoOptional(inbound.occurredAtLocal),
        note: inbound.note.trim().length === 0 ? null : inbound.note.trim(),
      });
      await samyInvoke(IPC_CHANNELS.INVENTORY_MOVEMENT_INBOUND, dto);
      invalidateInventoryCaches();
      setStatus("SUCCÈS — Entrée industrielle persistée.");
      await reloadMovements(meta.page).catch(console.error);
      setInbound((prev) => ({ ...prev, qtyIn: "1", note: "", occurredAtLocal: "" }));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyTab(null);
    }
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canAdjust) return;
    setBusyTab("adjust");
    setStatus(null);
    try {
      const dto = manualAdjustmentSchema.parse({
        materialKind: adjust.materialKind,
        rawMaterialId: adjust.materialKind === "RAW" ? adjust.rawMaterialId : undefined,
        packagingMaterialId: adjust.materialKind === "PACKAGING" ? adjust.packagingMaterialId : undefined,
        targetQty: adjust.targetQty,
        occurredAt: toIsoOptional(adjust.occurredAtLocal),
        note: adjust.note.trim().length === 0 ? null : adjust.note.trim(),
      });
      await samyInvoke(IPC_CHANNELS.INVENTORY_MOVEMENT_MANUAL_ADJUSTMENT, dto);
      invalidateInventoryCaches();
      setStatus("SUCCÈS — Ajustement physique persisté (MANUAL_ADJUSTMENT).");
      await reloadMovements(meta.page).catch(console.error);
      setAdjust((prev) => ({ ...prev, note: "", occurredAtLocal: "" }));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyTab(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Journal & mouvements physiques"
        subtitle="Ledger-only : aucune quantité mutée hors StockMovement ; les entrées acheteurs restent réservées au module Réceptions."
        actions={
          <button
            type="button"
            className="focus-ring inline-flex min-h-touch items-center gap-2 border border-border bg-surface-muted px-3 py-2 text-[11.8px] font-semibold hover:bg-surface"
            onClick={() => reloadMovements(meta.page).catch(console.error)}
          >
            <RefreshCw className="h-[15px] w-[15px]" aria-hidden />
            Rafraîchir mouvements
          </button>
        }
      />

      <nav className="flex flex-wrap gap-2 rounded-[var(--erp-radius-panel)] border border-border bg-surface-muted/40 p-2 text-[11.5px] font-semibold">
        <PanelTab active={panel === "list"} onClick={() => setPanel("list")}>
          Ledger complet
        </PanelTab>
        <PanelTab active={panel === "outbound"} onClick={() => setPanel("outbound")}>
          Sortie / consommation
        </PanelTab>
        <PanelTab active={panel === "inbound"} onClick={() => setPanel("inbound")}>
          Entrée corrective
        </PanelTab>
        <PanelTab active={panel === "adjust"} onClick={() => setPanel("adjust")}>
          Ajustement cible
        </PanelTab>
      </nav>

      {status ? (
        <div
          className={`border px-4 py-2 text-[12px] ${status.startsWith("SUCCÈS") ? "border-emerald-600/45 bg-emerald-500/15 text-emerald-900 dark:text-emerald-50" : "border-danger/50 bg-danger/10 text-danger"}`}
        >
          {status}
        </div>
      ) : null}

      {panel === "list" ? (
        <>
          <DataTable columns={columns} data={rows} emptyLabel="Aucun mouvement : initialisez avec une réception ou un mouvement d’atelier." />
          <div className="flex justify-between gap-4 text-[11px] text-foreground-muted">
            <button
              type="button"
              disabled={meta.page <= 1}
              className="font-semibold text-accent hover:underline disabled:opacity-40"
              onClick={() => reloadMovements(meta.page - 1).catch(console.error)}
            >
              Page précédente
            </button>
            <div>
              Page {meta.page} — {meta.total} lignes mouvements
            </div>
            <button
              type="button"
              disabled={meta.page * meta.pageSize >= meta.total}
              className="font-semibold text-accent hover:underline disabled:opacity-40"
              onClick={() => reloadMovements(meta.page + 1).catch(console.error)}
            >
              Page suivante
            </button>
          </div>
        </>
      ) : null}

      {panel !== "list" && !canAdjust ? (
        <p className="border border-danger/60 bg-danger/10 px-3 py-2 text-[12px] text-danger">
          La saisie de mouvements nécessite <code className="font-mono text-[11px]">inventory.adjust</code>.
        </p>
      ) : null}

      {panel === "outbound" && canAdjust ? (
        <form className="space-y-4 border border-border bg-surface-muted/40 p-4" onSubmit={(event) => void submitOutbound(event)}>
          <div className="text-[12px] font-semibold text-foreground">
            Sortie physique — saisissez la quantité consommée (positive) pour appliquer un delta signé automatiquement.
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Motif mouvement">
              <select
                className="control-chrome w-full"
                value={outbound.inventoryKind}
                onChange={(event) =>
                  setOutbound((prev) => ({ ...prev, inventoryKind: event.target.value as (typeof OUTBOUND_KINDS)[number] }))
                }
              >
                {OUTBOUND_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Type article">
              <select
                className="control-chrome w-full"
                value={outbound.materialKind}
                onChange={(event) => setOutbound((prev) => ({ ...prev, materialKind: event.target.value as "RAW" | "PACKAGING" }))}
              >
                <option value="RAW">Matière</option>
                <option value="PACKAGING">Emballage</option>
              </select>
            </FormField>
            <FormField label="Article">
              <select
                className="control-chrome w-full font-mono"
                required
                value={outbound.materialKind === "RAW" ? outbound.rawMaterialId : outbound.packagingMaterialId}
                onChange={(event) =>
                  setOutbound((prev) =>
                    prev.materialKind === "RAW"
                      ? { ...prev, rawMaterialId: event.target.value }
                      : { ...prev, packagingMaterialId: event.target.value },
                  )
                }
              >
                <option value="">—</option>
                {(outbound.materialKind === "RAW" ? rawMaterials : packMaterials).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} · {item.labelFr}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Quantité consommée">
              <input
                required
                className="control-chrome w-full font-mono"
                value={outbound.qtyOut}
                onChange={(event) => setOutbound((prev) => ({ ...prev, qtyOut: event.target.value }))}
              />
            </FormField>
            <FormField label="Occurrence (vide = instantanée)">
              <input type="datetime-local" className="control-chrome w-full font-mono" value={outbound.occurredAtLocal} onChange={(event) => setOutbound((prev) => ({ ...prev, occurredAtLocal: event.target.value }))} />
            </FormField>
            <FormField label="Commentaire atelier">
              <textarea className="control-chrome min-h-[84px] w-full" value={outbound.note} onChange={(event) => setOutbound((prev) => ({ ...prev, note: event.target.value }))} />
            </FormField>
          </div>
          <button
            type="submit"
            disabled={busyTab === "outbound"}
            className="focus-ring border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-95 disabled:opacity-40"
          >
            Poster mouvement
          </button>
        </form>
      ) : null}

      {panel === "inbound" && canAdjust ? (
        <form className="space-y-4 border border-border bg-surface-muted/40 p-4" onSubmit={(event) => void submitInbound(event)}>
          <div className="text-[12px] font-semibold text-foreground">
            Entrées correctives hors achat (&quot;RETURN_IN&quot; / &quot;PRODUCTION_IN&quot;).
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Type entrée">
              <select className="control-chrome w-full" value={inbound.inventoryKind} onChange={(event) => setInbound((prev) => ({ ...prev, inventoryKind: event.target.value as (typeof INBOUND_KINDS)[number] }))}>
                {INBOUND_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Type article">
              <select className="control-chrome w-full" value={inbound.materialKind} onChange={(event) => setInbound((prev) => ({ ...prev, materialKind: event.target.value as "RAW" | "PACKAGING" }))}>
                <option value="RAW">Matière</option>
                <option value="PACKAGING">Emballage</option>
              </select>
            </FormField>
            <FormField label="Article">
              <select
                required
                className="control-chrome w-full font-mono"
                value={inbound.materialKind === "RAW" ? inbound.rawMaterialId : inbound.packagingMaterialId}
                onChange={(event) =>
                  setInbound((prev) =>
                    prev.materialKind === "RAW"
                      ? { ...prev, rawMaterialId: event.target.value }
                      : { ...prev, packagingMaterialId: event.target.value },
                  )
                }
              >
                <option value="">—</option>
                {(inbound.materialKind === "RAW" ? rawMaterials : packMaterials).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} · {item.labelFr}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Quantité réintégrée">
              <input required className="control-chrome w-full font-mono" value={inbound.qtyIn} onChange={(event) => setInbound((prev) => ({ ...prev, qtyIn: event.target.value }))} />
            </FormField>
            <FormField label="Occurrence (vide = instantanée)">
              <input type="datetime-local" className="control-chrome w-full font-mono" value={inbound.occurredAtLocal} onChange={(event) => setInbound((prev) => ({ ...prev, occurredAtLocal: event.target.value }))} />
            </FormField>
            <FormField label="Commentaire QA">
              <textarea className="control-chrome min-h-[84px] w-full" value={inbound.note} onChange={(event) => setInbound((prev) => ({ ...prev, note: event.target.value }))} />
            </FormField>
          </div>
          <button
            type="submit"
            disabled={busyTab === "inbound"}
            className="focus-ring border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-95 disabled:opacity-40"
          >
            Poster entrée industrielle
          </button>
        </form>
      ) : null}

      {panel === "adjust" && canAdjust ? (
        <form className="space-y-4 border border-border bg-surface-muted/40 p-4" onSubmit={(event) => void submitAdjustment(event)}>
          <div className="text-[12px] font-semibold text-foreground">
            Inventaire physique : précisez la quantité physique constatée après comptage.
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Type article">
              <select className="control-chrome w-full" value={adjust.materialKind} onChange={(event) => setAdjust((prev) => ({ ...prev, materialKind: event.target.value as "RAW" | "PACKAGING" }))}>
                <option value="RAW">Matière</option>
                <option value="PACKAGING">Emballage</option>
              </select>
            </FormField>
            <FormField label="Article">
              <select
                required
                className="control-chrome w-full font-mono"
                value={adjust.materialKind === "RAW" ? adjust.rawMaterialId : adjust.packagingMaterialId}
                onChange={(event) =>
                  setAdjust((prev) =>
                    prev.materialKind === "RAW"
                      ? { ...prev, rawMaterialId: event.target.value }
                      : { ...prev, packagingMaterialId: event.target.value },
                  )
                }
              >
                <option value="">—</option>
                {(adjust.materialKind === "RAW" ? rawMaterials : packMaterials).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} · {item.labelFr}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Quantité physique cible">
              <input required className="control-chrome w-full font-mono" value={adjust.targetQty} onChange={(event) => setAdjust((prev) => ({ ...prev, targetQty: event.target.value }))} />
            </FormField>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Occurrence">
              <input type="datetime-local" className="control-chrome w-full font-mono" value={adjust.occurredAtLocal} onChange={(event) => setAdjust((prev) => ({ ...prev, occurredAtLocal: event.target.value }))} />
            </FormField>
            <FormField label="Justification QA">
              <textarea className="control-chrome min-h-[84px] w-full" value={adjust.note} onChange={(event) => setAdjust((prev) => ({ ...prev, note: event.target.value }))} />
            </FormField>
          </div>
          <button
            type="submit"
            disabled={busyTab === "adjust"}
            className="focus-ring border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-95 disabled:opacity-40"
          >
            Déclarer ajustement
          </button>
        </form>
      ) : null}
    </div>
  );
}

function PanelTab(props: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      className={`rounded-[calc(var(--erp-radius-panel)-2px)] border px-3 py-2 transition-colors ${props.active ? "border-accent bg-accent/10 text-accent" : "border-transparent hover:bg-surface"}`}
    >
      {props.children}
    </button>
  );
}
