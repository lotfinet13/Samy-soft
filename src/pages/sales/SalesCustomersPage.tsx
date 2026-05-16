import { zodResolver } from "@hookform/resolvers/zod";
import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { customerUpsertSchema } from "@shared/schemas/sales";
import type { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

type FormValues = z.input<typeof customerUpsertSchema>;

type CustomerRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  city: string | null;
  isActive: boolean;
};

function emptyCustomer(): FormValues {
  return {
    code: "",
    name: "",
    phone: null,
    email: "",
    address: null,
    city: null,
    taxIdentifier: null,
    notes: null,
    isActive: true,
  };
}

export function SalesCustomersPage() {
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.SALES_WRITE);

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 40 });
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(customerUpsertSchema),
    defaultValues: emptyCustomer(),
  });

  async function reload(page = 1): Promise<void> {
    const res = await samyInvoke<{ items: CustomerRow[]; total: number }>(IPC_CHANNELS.SALES_CUSTOMER_LIST, {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew(): void {
    form.reset(emptyCustomer());
    setModalOpen(true);
  }

  async function onSubmit(values: FormValues): Promise<void> {
    await samyInvoke(IPC_CHANNELS.SALES_CUSTOMER_UPSERT, values);
    setModalOpen(false);
    await reload(meta.page);
  }

  const columns = useMemo<ColumnDef<CustomerRow>[]>(
    () => [
      {
        header: "Code",
        accessorKey: "code",
        cell: ({ row }) => (
          <Link className="font-mono text-[11px] text-accent hover:underline" to={`/ventes/clients/${row.original.id}`}>
            {row.original.code}
          </Link>
        ),
      },
      { header: "Raison sociale", accessorKey: "name" },
      { header: "Téléphone", accessorKey: "phone" },
      { header: "Ville", accessorKey: "city" },
      {
        header: "Actif",
        accessorKey: "isActive",
        cell: ({ row }) => (row.original.isActive ? "Oui" : "Non"),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Clients" subtitle="Comptes clients — codes uniques, filtres opérationnels." />

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
            Nouveau client
          </button>
        ) : null}
      </div>

      <DataTable columns={columns} data={rows} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau client">
        <form className="flex flex-col gap-3 p-1" onSubmit={form.handleSubmit((v) => void onSubmit(v))}>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Code client *" error={form.formState.errors.code?.message}>
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
