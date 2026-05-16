import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { downloadBase64Blob } from "@/lib/binary-download";
import { invalidateInventoryCaches, invalidateReportsCaches, invalidateSalesCaches } from "@/lib/invalidate-ui-cache";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";
import { invoiceStatusLabels, paymentMethodLabels, paymentStatusLabels } from "./sales-labels";

type ItemRow = {
  id: string;
  productId: string | null;
  labelFr: string;
  skuSnapshot: string | null;
  quantitySerialized: string;
  unitPriceSerialized: string;
  lineDiscountSerialized: string;
  taxRateSerialized: string;
  lineTotalSerialized: string;
};

type PayRow = {
  id: string;
  amountSerialized: string;
  method: string;
  paidAt: string;
  reference: string | null;
};

export function SalesInvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.SALES_WRITE);
  const canValidate = can(PERMISSIONS.SALES_VALIDATE);
  const canPay = can(PERMISSIONS.SALES_PAYMENT);
  const canCancel = can(PERMISSIONS.SALES_CANCEL);
  const canPdfInvoice = can(PERMISSIONS.REPORTS_EXPORT) && can(PERMISSIONS.SALES_REPORT);

  const [err, setErr] = useState<string | null>(null);

  type Detail = {
    id: string;
    number: string;
    status: string;
    paymentStatus: string;
    issuedAt: string;
    dueAt: string | null;
    currencyCode: string;
    notes: string | null;
    discountAmountSerialized: string;
    subtotalAmountSerialized: string;
    taxAmountSerialized: string;
    totalAmountSerialized: string;
    balanceSerialized: string;
    customer: { id: string; code: string; name: string };
    items: ItemRow[];
    payments: PayRow[];
  };

  const [inv, setInv] = useState<Detail | null>(null);

  const [dueAt, setDueAt] = useState("");
  const [disc, setDisc] = useState("0");
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<
    Array<{
      productId: string;
      labelFr: string;
      qty: string;
      unitPrice: string;
      lineDiscount: string;
      taxRate: string;
    }>
  >([]);

  const [products, setProducts] = useState<Array<{ id: string; sku: string; name: string; sellingPriceSerialized: string }>>([]);

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"CASH" | "BANK_TRANSFER" | "CHEQUE" | "OTHER">("CASH");
  const [payRef, setPayRef] = useState("");

  async function pull(): Promise<void> {
    if (!invoiceId) return;
    const res = await samyInvoke<{ invoice: Detail }>(IPC_CHANNELS.SALES_INVOICE_GET, invoiceId);
    const i = res.invoice;
    setInv(i);
    setDueAt(i.dueAt ? i.dueAt.slice(0, 10) : "");
    setDisc(i.discountAmountSerialized);
    setNotes(i.notes ?? "");
    setLines(
      i.items.map((it) => ({
        productId: it.productId ?? "",
        labelFr: it.labelFr,
        qty: it.quantitySerialized,
        unitPrice: it.unitPriceSerialized,
        lineDiscount: it.lineDiscountSerialized,
        taxRate: it.taxRateSerialized,
      })),
    );
  }

  useEffect(() => {
    if (!invoiceId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        await pull();
        const pr = await samyInvoke<{ items: typeof products }>(IPC_CHANNELS.SALES_PRODUCT_LIST, {
          page: 1,
          pageSize: 400,
          q: "",
          includeInactive: false,
        });
        if (!cancelled) setProducts(pr.items);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  async function saveHeader(): Promise<void> {
    if (!invoiceId) return;
    setErr(null);
    try {
      await samyInvoke(IPC_CHANNELS.SALES_INVOICE_UPDATE_DRAFT, {
        invoiceId,
        patch: {
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          discountAmount: disc,
          notes: notes || null,
        },
      });
      invalidateSalesCaches();
      await pull();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveLines(): Promise<void> {
    if (!invoiceId) return;
    setErr(null);
    try {
      await samyInvoke(IPC_CHANNELS.SALES_INVOICE_LINES_REPLACE, {
        invoiceId,
        lines: lines.map((ln) => ({
          productId: ln.productId || null,
          labelFr: ln.labelFr,
          quantity: ln.qty,
          unitPrice: ln.unitPrice,
          lineDiscount: ln.lineDiscount || "0",
          taxRate: ln.taxRate || "0",
        })),
      });
      invalidateSalesCaches();
      await pull();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function doValidate(): Promise<void> {
    if (!invoiceId) return;
    setErr(null);
    try {
      await samyInvoke(IPC_CHANNELS.SALES_INVOICE_VALIDATE, { invoiceId });
      invalidateSalesCaches();
      invalidateInventoryCaches();
      invalidateReportsCaches();
      await pull();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function doCancel(): Promise<void> {
    if (!invoiceId) return;
    setErr(null);
    try {
      await samyInvoke(IPC_CHANNELS.SALES_INVOICE_CANCEL, { invoiceId });
      invalidateSalesCaches();
      invalidateInventoryCaches();
      invalidateReportsCaches();
      await pull();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function doPay(): Promise<void> {
    if (!invoiceId) return;
    setErr(null);
    try {
      await samyInvoke(IPC_CHANNELS.SALES_PAYMENT_REGISTER, {
        invoiceId,
        amount: payAmount,
        method: payMethod,
        reference: payRef || null,
      });
      setPayAmount("");
      invalidateSalesCaches();
      invalidateReportsCaches();
      await pull();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function exportInvoicePdf(): Promise<void> {
    if (!invoiceId) return;
    setErr(null);
    try {
      const res = await samyInvoke<{ base64: string; filenameSuggested: string }>(
        IPC_CHANNELS.REPORTS_PDF_INVOICE,
        { invoiceId },
      );
      downloadBase64Blob(res, "application/pdf", res.filenameSuggested);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function addLine(): void {
    const p = products[0];
    setLines((prev) => [
      ...prev,
      {
        productId: p?.id ?? "",
        labelFr: p?.name ?? "Ligne",
        qty: "1",
        unitPrice: p?.sellingPriceSerialized ?? "0",
        lineDiscount: "0",
        taxRate: "0",
      },
    ]);
  }

  if (!invoiceId) return <p className="text-[12px] text-danger">Facture introuvable.</p>;
  if (!inv) return <p className="text-[12px] text-foreground-muted">Chargement…</p>;

  const isDraft = inv.status === "DRAFT";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Facture ${inv.number}`}
        subtitle={`${invoiceStatusLabels[inv.status]} · ${paymentStatusLabels[inv.paymentStatus]} · ${inv.customer.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canPdfInvoice ? (
              <button type="button" className="btn-secondary h-9 px-3 text-[12px] leading-9" onClick={() => void exportInvoicePdf()}>
                PDF facture A4
              </button>
            ) : null}
            <Link className="btn-secondary h-9 px-3 text-[12px] leading-9" to="/ventes/factures">
              ← Liste
            </Link>
          </div>
        }
      />

      {err ? <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">{err}</p> : null}

      <section className="erp-panel grid gap-3 p-3 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-2 text-[12px]">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <span className="text-foreground-muted">Client:</span>{" "}
              <span className="font-mono">{inv.customer.code}</span> {inv.customer.name}
            </span>
            <span>
              <span className="text-foreground-muted">Date:</span> {inv.issuedAt.slice(0, 10)}
            </span>
            <span>
              <span className="text-foreground-muted">Devise:</span> {inv.currencyCode}
            </span>
          </div>
          <div className="grid gap-2 font-mono text-[13px] sm:grid-cols-3">
            <div>
              <div className="text-[10px] uppercase text-foreground-muted">HT + taxes</div>
              <div>
                {inv.subtotalAmountSerialized} + {inv.taxAmountSerialized}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-foreground-muted">Remise</div>
              <div>{inv.discountAmountSerialized}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-foreground-muted">TTC</div>
              <div className="font-bold">{inv.totalAmountSerialized}</div>
            </div>
          </div>
          <div className="text-[12px]">
            <span className="text-foreground-muted">Solde:</span>{" "}
            <span className="font-mono font-semibold">{inv.balanceSerialized}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          {isDraft && canWrite ? (
            <>
              <label className="text-[11px] font-semibold uppercase text-foreground-muted">
                Échéance
                <input type="date" className="control-chrome mt-1 h-9 w-full px-2" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </label>
              <label className="text-[11px] font-semibold uppercase text-foreground-muted">
                Remise facture
                <input className="control-chrome mt-1 h-9 w-full px-2" value={disc} onChange={(e) => setDisc(e.target.value)} />
              </label>
              <label className="text-[11px] font-semibold uppercase text-foreground-muted">
                Notes
                <textarea className="control-chrome mt-1 min-h-[52px] w-full px-2 py-1 text-[13px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <button type="button" className="btn-secondary h-9 text-[12px]" onClick={() => void saveHeader()}>
                Enregistrer en-tête
              </button>
            </>
          ) : null}
          {isDraft && canValidate ? (
            <button type="button" className="btn-primary h-9 text-[12px]" onClick={() => void doValidate()}>
              Valider (grand-livre SALES_OUT)
            </button>
          ) : null}
          {isDraft && canCancel ? (
            <button type="button" className="btn-secondary h-9 text-[12px] text-danger" onClick={() => void doCancel()}>
              Annuler brouillon
            </button>
          ) : null}
          {!isDraft && inv.status !== "CANCELLED" && inv.status !== "PAID" && canCancel ? (
            <button type="button" className="btn-secondary h-9 text-[12px] text-danger" onClick={() => void doCancel()}>
              Annuler facture (retour stock)
            </button>
          ) : null}
        </div>
      </section>

      {isDraft && canWrite ? (
        <section
          tabIndex={-1}
          className="erp-panel p-3 outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-accent))]"
          onKeyDown={(event) => {
            if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
            event.preventDefault();
            void saveLines();
          }}
        >
          <header className="mb-2 flex flex-col gap-1 border-b border-border pb-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground-muted">Lignes (brouillon)</h2>
              <button type="button" className="btn-secondary h-8 px-2 text-[11px]" onClick={addLine}>
                + Ligne
              </button>
            </div>
            <p className="text-[11px] text-foreground-muted">
              Compact : focus dans le tableau puis <kbd className="font-mono text-foreground">Ctrl</kbd> +{" "}
              <kbd className="font-mono text-foreground">Entrée</kbd> applique les lignes.
            </p>
          </header>
          <div className="overflow-auto">
            <table className="erp-table text-[11px]">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Libellé</th>
                  <th>Qté</th>
                  <th>PU</th>
                  <th>Rem.</th>
                  <th>TVA%</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((ln, idx) => (
                  <tr key={`${idx}-${ln.labelFr}`}>
                    <td>
                      <select
                        className="control-chrome max-w-[140px] px-1 py-0.5"
                        value={ln.productId}
                        onChange={(e) => {
                          const pid = e.target.value;
                          const pr = products.find((x) => x.id === pid);
                          setLines((prev) =>
                            prev.map((row, i) =>
                              i === idx
                                ? {
                                    ...row,
                                    productId: pid,
                                    labelFr: pr?.name ?? row.labelFr,
                                    unitPrice: pr?.sellingPriceSerialized ?? row.unitPrice,
                                  }
                                : row,
                            ),
                          );
                        }}
                      >
                        <option value="">—</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="control-chrome w-full min-w-[120px] px-1 py-0.5"
                        value={ln.labelFr}
                        onChange={(e) =>
                          setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, labelFr: e.target.value } : row)))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="control-chrome w-16 px-1 py-0.5 font-mono"
                        value={ln.qty}
                        onChange={(e) =>
                          setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, qty: e.target.value } : row)))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="control-chrome w-20 px-1 py-0.5 font-mono"
                        value={ln.unitPrice}
                        onChange={(e) =>
                          setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, unitPrice: e.target.value } : row)))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="control-chrome w-16 px-1 py-0.5 font-mono"
                        value={ln.lineDiscount}
                        onChange={(e) =>
                          setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, lineDiscount: e.target.value } : row)))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="control-chrome w-14 px-1 py-0.5 font-mono"
                        value={ln.taxRate}
                        onChange={(e) =>
                          setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, taxRate: e.target.value } : row)))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" className="btn-primary h-9 px-3 text-[12px]" onClick={() => void saveLines()}>
              Appliquer lignes
            </button>
          </div>
        </section>
      ) : (
        <section className="erp-panel p-3">
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-foreground-muted">Lignes figées</h2>
          <div className="overflow-auto">
            <table className="erp-table text-[11px]">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Désignation</th>
                  <th className="text-right">Qté</th>
                  <th className="text-right">TTC ligne</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it) => (
                  <tr key={it.id}>
                    <td className="font-mono">{it.skuSnapshot ?? "—"}</td>
                    <td>{it.labelFr}</td>
                    <td className="text-right font-mono">{it.quantitySerialized}</td>
                    <td className="text-right font-mono">{it.lineTotalSerialized}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(inv.status === "VALIDATED" || inv.status === "PAID") && inv.paymentStatus !== "PAID" ? (
        <section className="erp-panel space-y-3 p-3">
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground-muted">Encaissement</h2>
          {!canPay ? <p className="text-[11px] text-foreground-muted">Permission sales.payment requise.</p> : null}
          <div className="flex flex-wrap gap-2">
            <input
              className="control-chrome h-9 w-28 px-2 font-mono text-[13px]"
              placeholder="Montant"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
            <select className="control-chrome h-9 px-2 text-[12px]" value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}>
              {(Object.keys(paymentMethodLabels) as Array<keyof typeof paymentMethodLabels>).map((k) => (
                <option key={k} value={k}>
                  {paymentMethodLabels[k]}
                </option>
              ))}
            </select>
            <input className="control-chrome h-9 min-w-[120px] px-2 text-[12px]" placeholder="Réf." value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            <button type="button" className="btn-primary h-9 px-3 text-[12px]" disabled={!canPay} onClick={() => void doPay()}>
              Enregistrer paiement
            </button>
          </div>
        </section>
      ) : null}

      <section className="erp-panel p-3">
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-foreground-muted">Historique paiements</h2>
        <div className="overflow-auto">
          <table className="erp-table text-[11px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Montant</th>
                <th>Méthode</th>
                <th>Réf.</th>
              </tr>
            </thead>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono">{p.paidAt.slice(0, 19)}</td>
                  <td className="font-mono">{p.amountSerialized}</td>
                  <td>{paymentMethodLabels[p.method] ?? p.method}</td>
                  <td>{p.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!inv.payments.length ? <p className="p-2 text-[12px] text-foreground-muted">Aucun paiement.</p> : null}
        </div>
      </section>
    </div>
  );
}
