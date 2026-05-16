import { zodResolver } from "@hookform/resolvers/zod";
import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { customerUpsertSchema } from "@shared/schemas/sales";
import type { z } from "zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";
import { invoiceStatusLabels, paymentStatusLabels } from "./sales-labels";

type FormValues = z.input<typeof customerUpsertSchema>;

export function SalesCustomerProfilePage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.SALES_WRITE);

  const [loading, setLoading] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(customerUpsertSchema),
  });

  type InvRow = {
    id: string;
    number: string;
    issuedAt: string;
    status: string;
    paymentStatus: string;
    totalAmountSerialized: string;
  };

  const [invoices, setInvoices] = useState<InvRow[]>([]);

  useEffect(() => {
    if (!customerId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const res = await samyInvoke<{ customer: unknown; invoices: InvRow[] }>(
          IPC_CHANNELS.SALES_CUSTOMER_GET,
          customerId,
        );
        if (cancelled) return;
        const c = res.customer as Record<string, unknown>;
        form.reset({
          id: String(c.id),
          code: String(c.code),
          name: String(c.name),
          phone: (c.phone as string | null) ?? null,
          email: (c.email as string | null) ?? "",
          address: (c.address as string | null) ?? null,
          city: (c.city as string | null) ?? null,
          taxIdentifier: (c.taxIdentifier as string | null) ?? null,
          notes: (c.notes as string | null) ?? null,
          isActive: Boolean(c.isActive),
        });
        setInvoices(res.invoices);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, form]);

  async function onSave(values: FormValues): Promise<void> {
    await samyInvoke(IPC_CHANNELS.SALES_CUSTOMER_UPSERT, values);
    if (customerId) {
      const res = await samyInvoke<{ invoices: InvRow[] }>(IPC_CHANNELS.SALES_CUSTOMER_GET, customerId);
      setInvoices(res.invoices);
    }
  }

  if (!customerId) return <p className="text-[12px] text-danger">Client manquant.</p>;
  if (loading) return <p className="text-[12px] text-foreground-muted">Chargement…</p>;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={form.watch("name") || "Client"}
        subtitle={`Code ${form.watch("code")}`}
        actions={
          <Link className="btn-secondary h-9 px-3 text-[12px] leading-9" to="/ventes/clients">
            ← Liste clients
          </Link>
        }
      />

      {canWrite ? (
        <form className="erp-panel flex flex-col gap-3 p-3" onSubmit={form.handleSubmit((v) => void onSave(v))}>
          <input type="hidden" {...form.register("id")} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Code *" error={form.formState.errors.code?.message}>
              <input className="control-chrome h-9 w-full px-2 text-[13px]" {...form.register("code")} />
            </FormField>
            <FormField label="Nom *" error={form.formState.errors.name?.message}>
              <input className="control-chrome h-9 w-full px-2 text-[13px]" {...form.register("name")} />
            </FormField>
            <FormField label="Téléphone" error={form.formState.errors.phone?.message}>
              <input className="control-chrome h-9 w-full px-2 text-[13px]" {...form.register("phone")} />
            </FormField>
            <FormField label="Email" error={form.formState.errors.email?.message}>
              <input className="control-chrome h-9 w-full px-2 text-[13px]" {...form.register("email")} />
            </FormField>
            <FormField label="Adresse" error={form.formState.errors.address?.message}>
              <input className="control-chrome h-9 w-full px-2 text-[13px]" {...form.register("address")} />
            </FormField>
            <FormField label="Ville" error={form.formState.errors.city?.message}>
              <input className="control-chrome h-9 w-full px-2 text-[13px]" {...form.register("city")} />
            </FormField>
            <FormField label="Identifiant fiscal" error={form.formState.errors.taxIdentifier?.message}>
              <input className="control-chrome h-9 w-full px-2 text-[13px]" {...form.register("taxIdentifier")} />
            </FormField>
            <label className="flex items-center gap-2 text-[12px] font-semibold">
              <input type="checkbox" {...form.register("isActive")} />
              Actif
            </label>
          </div>
          <FormField label="Notes" error={form.formState.errors.notes?.message}>
            <textarea className="control-chrome min-h-[72px] w-full px-2 py-1.5 text-[13px]" {...form.register("notes")} />
          </FormField>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary h-9 px-3 text-[12px]" disabled={form.formState.isSubmitting}>
              Mettre à jour
            </button>
          </div>
        </form>
      ) : null}

      <section className="erp-panel">
        <header className="border-b border-border px-3 py-2">
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground-muted">Factures liées</h2>
        </header>
        <div className="overflow-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="text-left">N°</th>
                <th className="text-left">Date</th>
                <th className="text-right">TTC</th>
                <th className="text-left">État</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-mono text-[11px]">
                    <Link className="text-accent hover:underline" to={`/ventes/factures/${inv.id}`}>
                      {inv.number}
                    </Link>
                  </td>
                  <td className="text-[11px]">{inv.issuedAt.slice(0, 10)}</td>
                  <td className="text-right font-mono">{inv.totalAmountSerialized}</td>
                  <td className="text-[11px]">
                    {invoiceStatusLabels[inv.status]} · {paymentStatusLabels[inv.paymentStatus]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!invoices.length ? <p className="p-4 text-[12px] text-foreground-muted">Aucune facture.</p> : null}
        </div>
      </section>
    </div>
  );
}
