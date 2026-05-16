import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useOperationalFilters } from "@/hooks/useOperationalFilters";
import { usePermissions } from "@/hooks/usePermissions";
import { invalidateSalesCaches } from "@/lib/invalidate-ui-cache";
import { samyInvoke } from "@/lib/samy";
import { invoiceStatusLabels, paymentStatusLabels } from "./sales-labels";

type InvRow = {
  id: string;
  number: string;
  issuedAt: string;
  status: string;
  paymentStatus: string;
  totalAmountSerialized: string;
  customer: { code: string; name: string };
};

type CustomerBrief = { id: string; code: string; name: string };

type ProductBrief = { id: string; sku: string; name: string; sellingPriceSerialized: string };

export function SalesInvoicesPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.SALES_WRITE);

  const [rows, setRows] = useState<InvRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 40 });
  const [modalOpen, setModalOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerBrief[]>([]);
  const [products, setProducts] = useState<ProductBrief[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [lineProductId, setLineProductId] = useState("");
  const [lineQty, setLineQty] = useState("1");
  const [linePrice, setLinePrice] = useState("");
  const [lineLabel, setLineLabel] = useState("");

  const [listQ, setListQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [paymentFilter, setPaymentFilter] = useState<string>("");
  const { chips, pushRecent, savePreset, removePreset } = useOperationalFilters("sales-invoices");
  const [presetName, setPresetName] = useState("");

  async function reload(page = 1, qOverride?: string): Promise<void> {
    const qs = qOverride !== undefined ? qOverride : listQ;
    const payload: Record<string, unknown> = {
      page,
      pageSize: meta.pageSize,
      q: qs,
    };
    if (statusFilter) payload.status = statusFilter;
    if (paymentFilter) payload.paymentStatus = paymentFilter;
    const res = await samyInvoke<{ items: InvRow[]; total: number }>(IPC_CHANNELS.SALES_INVOICE_LIST, payload);
    setRows(res.items);
    setMeta({ total: res.total, page, pageSize: meta.pageSize });
  }

  useEffect(() => {
    void reload(1).catch(console.error);
    void samyInvoke<{ items: CustomerBrief[] }>(IPC_CHANNELS.SALES_CUSTOMER_LIST, {
      page: 1,
      pageSize: 500,
      q: "",
      includeInactive: false,
    }).then((r) => setCustomers(r.items));
    void samyInvoke<{ items: ProductBrief[] }>(IPC_CHANNELS.SALES_PRODUCT_LIST, {
      page: 1,
      pageSize: 500,
      q: "",
      includeInactive: true,
    }).then((r) => setProducts(r.items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createDraft(): Promise<void> {
    if (!customerId) return;
    const prod = products.find((p) => p.id === lineProductId);
    const lines =
      lineProductId && prod
        ? [
            {
              productId: prod.id,
              labelFr: prod.name,
              quantity: lineQty,
              unitPrice: linePrice || prod.sellingPriceSerialized,
              lineDiscount: "0",
              taxRate: "0",
            },
          ]
        : [
            {
              productId: null,
              labelFr: lineLabel.trim() || "Prestation",
              quantity: lineQty,
              unitPrice: linePrice || "0",
              lineDiscount: "0",
              taxRate: "0",
            },
          ];

    const res = await samyInvoke<{ id: string }>(IPC_CHANNELS.SALES_INVOICE_CREATE_DRAFT, {
      customerId,
      discountAmount: "0",
      lines,
    });
    invalidateSalesCaches();
    setModalOpen(false);
    navigate(`/ventes/factures/${res.id}`);
  }

  const columns = useMemo<ColumnDef<InvRow>[]>(
    () => [
      {
        header: "N°",
        accessorKey: "number",
        cell: ({ row }) => (
          <Link className="font-mono text-[11px] text-accent hover:underline" to={`/ventes/factures/${row.original.id}`}>
            {row.original.number}
          </Link>
        ),
      },
      { header: "Client", accessorFn: (r) => `${r.customer.code} · ${r.customer.name}` },
      {
        header: "Date",
        accessorFn: (r) => r.issuedAt.slice(0, 10),
      },
      { header: "TTC", accessorKey: "totalAmountSerialized" },
      {
        header: "État",
        accessorFn: (r) => `${invoiceStatusLabels[r.status]} / ${paymentStatusLabels[r.paymentStatus]}`,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Factures" subtitle="Brouillons, validation industrielle, trajet vers paiement." />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Recherche
          <input
            className="control-chrome h-9 min-w-[180px] px-2 font-mono text-[12px]"
            value={listQ}
            onChange={(e) => setListQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (listQ.trim().length >= 2) pushRecent(listQ.trim());
                void reload(1);
              }
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Statut
          <select
            className="control-chrome h-9 min-w-[140px] px-2 text-[12px]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="DRAFT">Brouillon</option>
            <option value="VALIDATED">Validée</option>
            <option value="PAID">Payée</option>
            <option value="CANCELLED">Annulée</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Paiement
          <select
            className="control-chrome h-9 min-w-[140px] px-2 text-[12px]"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="UNPAID">Impayé</option>
            <option value="PARTIAL">Partiel</option>
            <option value="PAID">Soldé</option>
          </select>
        </label>
        <button
          type="button"
          className="btn-primary h-9 px-3 text-[12px]"
          onClick={() => {
            if (listQ.trim().length >= 2) pushRecent(listQ.trim());
            void reload(1);
          }}
        >
          Appliquer filtres
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-1 text-[11px]">
          <input
            className="control-chrome w-36 px-2 py-1 font-mono"
            placeholder="Nom vue"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button
            type="button"
            className="border border-border px-2 py-1 font-semibold hover:bg-surface-muted"
            onClick={() => savePreset(presetName || listQ || "Vue", listQ)}
          >
            Mémoriser
          </button>
        </div>
      </div>

      {chips.length ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-semibold text-foreground-muted">Vues :</span>
          {chips.map((c) => (
            <span key={`${c.kind}-${c.label}`} className="inline-flex items-center gap-0.5">
              <button
                type="button"
                className="rounded-full border border-border bg-surface-muted px-2 py-0.5 font-semibold hover:bg-surface"
                onClick={() => {
                  setListQ(c.query);
                  void reload(1, c.query);
                }}
              >
                {c.kind === "saved" ? `★ ${c.label}` : c.label}
              </button>
              {c.kind === "saved" ? (
                <button
                  type="button"
                  className="px-1 font-mono text-foreground-muted hover:text-danger"
                  aria-label={`Supprimer ${c.label}`}
                  onClick={() => removePreset(c.label)}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canWrite ? (
          <button type="button" className="btn-secondary inline-flex h-9 items-center gap-2 px-3 text-[12px]" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouveau brouillon
          </button>
        ) : null}
        <button type="button" className="btn-primary h-9 px-3 text-[12px]" onClick={() => void reload(1)}>
          Actualiser
        </button>
      </div>

      <DataTable columns={columns} data={rows} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau brouillon">
        <div className="flex flex-col gap-3 p-1 text-[13px]">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
            Client
            <select className="control-chrome h-9 px-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
            Produit (optionnel — sinon libellé)
            <select className="control-chrome h-9 px-2" value={lineProductId} onChange={(e) => setLineProductId(e.target.value)}>
              <option value="">—</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </select>
          </label>
          {!lineProductId ? (
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
              Libellé ligne
              <input className="control-chrome h-9 px-2" value={lineLabel} onChange={(e) => setLineLabel(e.target.value)} />
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
              Qté
              <input className="control-chrome h-9 px-2" value={lineQty} onChange={(e) => setLineQty(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
              PU
              <input className="control-chrome h-9 px-2" value={linePrice} onChange={(e) => setLinePrice(e.target.value)} placeholder=" défaut catalogue " />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button type="button" className="btn-secondary h-9 px-3 text-[12px]" onClick={() => setModalOpen(false)}>
              Annuler
            </button>
            <button type="button" className="btn-primary h-9 px-3 text-[12px]" onClick={() => void createDraft()} disabled={!customerId}>
              Créer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
