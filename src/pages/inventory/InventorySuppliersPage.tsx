import { zodResolver } from "@hookform/resolvers/zod";
import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { supplierUpsertSchema } from "@shared/schemas/inventory";
import type { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

type FormValues = z.input<typeof supplierUpsertSchema>;

type SupplierRow = {
  id: string;
  name: string;
  isActive?: boolean | null;
  linkedRaw?: number;
  linkedPackaging?: number;
  purchaseCount?: number;
};

type SupplierListPayload = {
  items: SupplierRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function InventorySuppliersPage() {
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.INVENTORY_WRITE);

  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 40 });
  const [modalOpen, setModalOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(supplierUpsertSchema),
    defaultValues: emptySupplier(),
  });

  async function reload(page = meta.page): Promise<void> {
    const res = await samyInvoke<SupplierListPayload>(IPC_CHANNELS.INVENTORY_SUPPLIER_LIST, {
      page,
      pageSize: meta.pageSize,
    });
    setRows(res.items);
    setMeta({ total: res.total, page: res.page, pageSize: res.pageSize });
  }

  useEffect(() => {
    void reload(1).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement puis pagination locale
  }, []);

  function openNew(): void {
    form.reset(emptySupplier());
    setModalOpen(true);
  }

  async function fetchDetail(rowId: string): Promise<void> {
    const supplier = await samyInvoke<
      SupplierRow & {
        contactName?: string | null;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
        notes?: string | null;
        isActive?: boolean | null;
      }
    >(IPC_CHANNELS.INVENTORY_SUPPLIER_GET, rowId);

    form.reset({
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName ?? null,
      phone: supplier.phone ?? null,
      email: supplier.email ?? "",
      address: supplier.address ?? null,
      notes: supplier.notes ?? null,
      isActive: Boolean(supplier.isActive),
    });
    setModalOpen(true);
  }

  const columns = useMemo<ColumnDef<SupplierRow>[]>(
    () => [
      { header: "Fournisseur", accessorKey: "name", cell: ({ row }) => <span className="font-semibold">{row.original.name}</span> },
      {
        header: "Matières",
        accessorFn: (r) => r.linkedRaw ?? 0,
      },
      {
        header: "Emball.",
        accessorFn: (r) => r.linkedPackaging ?? 0,
      },
      {
        header: "Achats",
        accessorFn: (r) => r.purchaseCount ?? 0,
      },
      {
        header: "",
        id: "actions",
        cell: ({ row }) =>
          canWrite ? (
            <button
              type="button"
              className="focus-ring text-[11px] font-semibold text-accent hover:underline"
              onClick={() => void fetchDetail(row.original.id).catch(console.error)}
            >
              Modifier
            </button>
          ) : null,
      },
    ],
    [canWrite],
  );

  async function submit(values: FormValues): Promise<void> {
    const normalized = supplierUpsertSchema.parse({
      ...values,
      name: values.name.trim(),
      contactName: values.contactName?.trim() ? values.contactName.trim() : null,
      phone: values.phone?.trim() ? values.phone.trim() : null,
      email: values.email ?? "",
      address: values.address?.trim() ? values.address.trim() : null,
      notes: values.notes?.trim() ? values.notes.trim() : null,
    });
    await samyInvoke(IPC_CHANNELS.INVENTORY_SUPPLIER_UPSERT, normalized);
    setModalOpen(false);
    await reload(meta.page).catch(console.error);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fournisseurs"
        subtitle="Référentiel achats ; les mouvements d’entrée acheteur sont tracés depuis les bons réception."
        actions={
          canWrite ? (
            <button
              type="button"
              className="focus-ring inline-flex min-h-touch items-center gap-2 border border-accent bg-accent px-3 py-2 text-[12px] font-semibold text-accent-foreground hover:opacity-95"
              onClick={() => openNew()}
            >
              <Plus className="h-[15px] w-[15px]" aria-hidden /> Nouveau fournisseur
            </button>
          ) : null
        }
      />

      <DataTable columns={columns} data={rows} emptyLabel="Aucun fournisseur encore déclaré." />

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
          Page {meta.page} — {meta.total}
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
        onClose={() => setModalOpen(false)}
        title={form.watch("id") ? "Modifier le fournisseur" : "Nouveau fournisseur"}
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
          <FormField label="Raison sociale" error={form.formState.errors.name?.message}>
            <input className="control-chrome w-full font-semibold" {...form.register("name")} />
          </FormField>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Contact">
              <input className="control-chrome w-full" {...form.register("contactName")} />
            </FormField>
            <FormField label="Téléphone">
              <input className="control-chrome w-full font-mono" {...form.register("phone")} />
            </FormField>
          </div>
          <FormField label="Email" error={typeof form.formState.errors.email?.message === "string" ? form.formState.errors.email.message : undefined}>
            <input type="email" className="control-chrome w-full font-mono" {...form.register("email")} />
          </FormField>
          <FormField label="Adresse">
            <textarea className="control-chrome min-h-[76px] w-full" {...form.register("address")} />
          </FormField>
          <FormField label="Notes">
            <textarea className="control-chrome min-h-[84px] w-full" {...form.register("notes")} />
          </FormField>

          <label className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
            <input type="checkbox" {...form.register("isActive")} /> Actif pour sélection métier
          </label>

          {canWrite ? (
            <button
              type="submit"
              className="focus-ring w-full border border-accent bg-accent py-2 text-[12px] font-semibold text-accent-foreground"
              disabled={form.formState.isSubmitting}
            >
              Enregistrer
            </button>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}

function emptySupplier(): FormValues {
  return {
    name: "",
    contactName: null,
    phone: null,
    email: "",
    address: null,
    notes: null,
    isActive: true,
  };
}
