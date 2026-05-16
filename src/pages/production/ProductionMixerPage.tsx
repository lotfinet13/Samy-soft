import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { productionOperationLogCreateSchema } from "@shared/schemas/production";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

type LogRow = {
  id: string;
  batchCode: string;
  mixerCode: string | null;
  runtimeMinutes: number | null;
  cleaningDone: boolean;
  maintenanceNeeded: boolean;
  operator: string;
  startedAt: string;
  endedAt: string | null;
  notesPreview: string;
};

export function ProductionMixerPage() {
  const { can } = usePermissions();
  const canExec = can(PERMISSIONS.PRODUCTION_EXECUTE);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 35 });
  const [mixerFilter, setMixerFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const [mixerCode, setMixerCode] = useState("");
  const [runtimeMinutes, setRuntimeMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [cleaningDone, setCleaningDone] = useState(false);
  const [maintenanceNeeded, setMaintenanceNeeded] = useState(false);
  const [cleaningNotes, setCleaningNotes] = useState("");
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [batchId, setBatchId] = useState("");

  async function reload(page = meta.page): Promise<void> {
    const res = await samyInvoke<{ items: LogRow[]; total: number; page: number; pageSize: number }>(
      IPC_CHANNELS.PRODUCTION_OPERATION_LOG_LIST,
      {
        page,
        pageSize: meta.pageSize,
        mixerCode: mixerFilter.trim(),
      },
    );
    setRows(res.items);
    setMeta({ total: res.total, page: res.page, pageSize: res.pageSize });
  }

  useEffect(() => {
    void reload(1).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo<ColumnDef<LogRow>[]>(
    () => [
      { header: "Début", accessorKey: "startedAt", cell: ({ row }) => <span className="font-mono text-[11px]">{row.original.startedAt.slice(0, 19)}</span> },
      { header: "Mélangeur", accessorKey: "mixerCode", cell: ({ row }) => <span className="font-semibold">{row.original.mixerCode ?? "—"}</span> },
      { header: "Lot", accessorKey: "batchCode", cell: ({ row }) => <span className="font-mono text-[11px] text-accent">{row.original.batchCode}</span> },
      { header: "Min", accessorKey: "runtimeMinutes" },
      {
        header: "Nettoyage",
        accessorKey: "cleaningDone",
        cell: ({ row }) => (
          <span className={row.original.cleaningDone ? "text-accent" : "text-warning"}>{row.original.cleaningDone ? "OK" : "⚠"}</span>
        ),
      },
      {
        header: "Maint.",
        accessorKey: "maintenanceNeeded",
        cell: ({ row }) => (row.original.maintenanceNeeded ? <span className="text-danger">Oui</span> : <span className="text-foreground-muted">—</span>),
      },
      { header: "Opérateur", accessorKey: "operator" },
      { header: "Notes", accessorKey: "notesPreview", cell: ({ row }) => <span className="line-clamp-2 text-[11px] text-foreground-muted">{row.original.notesPreview}</span> },
    ],
    [],
  );

  async function submitLog(): Promise<void> {
    const payload = productionOperationLogCreateSchema.parse({
      batchId: batchId.trim().length ? batchId.trim() : null,
      mixerCode: mixerCode.trim().length ? mixerCode.trim() : null,
      runtimeMinutes: runtimeMinutes.trim().length ? Number(runtimeMinutes) : null,
      cleaningDone,
      cleaningNotes: cleaningNotes.trim().length ? cleaningNotes.trim() : null,
      maintenanceNeeded,
      maintenanceNotes: maintenanceNotes.trim().length ? maintenanceNotes.trim() : null,
      notes: notes.trim().length ? notes.trim() : null,
    });

    await samyInvoke(IPC_CHANNELS.PRODUCTION_OPERATION_LOG_CREATE, payload);

    setCreateOpen(false);
    setMixerCode("");
    setRuntimeMinutes("");
    setNotes("");
    setCleaningNotes("");
    setMaintenanceNotes("");
    setBatchId("");
    setCleaningDone(false);
    setMaintenanceNeeded(false);
    await reload(1).catch(console.error);
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Journal mélangeurs & postes"
        subtitle="Traçabilité machine / opérateur — aligné maintenance préventive à venir."
        actions={
          canExec ? (
            <button type="button" className="border border-accent bg-accent px-3 py-2 text-[12px] font-semibold text-accent-foreground" onClick={() => setCreateOpen(true)}>
              Saisir passage
            </button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-3 text-[12px]">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase text-foreground-muted">Filtre code mélangeur</span>
          <input className="control-chrome w-[200px] font-mono" value={mixerFilter} onChange={(e) => setMixerFilter(e.target.value)} placeholder="M-01" />
        </label>
        <button type="button" className="border border-border px-3 py-2 font-semibold hover:bg-surface-muted" onClick={() => reload(1).catch(console.error)}>
          Filtrer
        </button>
      </div>

      <DataTable columns={columns} data={rows} emptyLabel="Aucun événement enregistré." />

      <div className="flex justify-between text-[11px] text-foreground-muted">
        <button type="button" disabled={meta.page <= 1} className="font-semibold text-accent disabled:opacity-40" onClick={() => reload(meta.page - 1).catch(console.error)}>
          Préc.
        </button>
        <button
          type="button"
          disabled={meta.page * meta.pageSize >= meta.total}
          className="font-semibold text-accent disabled:opacity-40"
          onClick={() => reload(meta.page + 1).catch(console.error)}
        >
          Suivante
        </button>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Saisie journal mélangeur">
        <div className="space-y-3 text-[12px]">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-foreground-muted">ID lot (UUID optionnel)</span>
            <input className="control-chrome font-mono text-[11px]" value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="Lier à ProductionBatch…" />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-foreground-muted">Code mélangeur</span>
              <input className="control-chrome font-mono" value={mixerCode} onChange={(e) => setMixerCode(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-foreground-muted">Durée (min)</span>
              <input className="control-chrome font-mono" value={runtimeMinutes} onChange={(e) => setRuntimeMinutes(e.target.value)} inputMode="numeric" />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cleaningDone} onChange={(e) => setCleaningDone(e.target.checked)} />
            <span>Cycle nettoyage effectué</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={maintenanceNeeded} onChange={(e) => setMaintenanceNeeded(e.target.checked)} />
            <span>Signalement maintenance</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-foreground-muted">Notes nettoyage</span>
            <textarea className="control-chrome min-h-[52px]" value={cleaningNotes} onChange={(e) => setCleaningNotes(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-foreground-muted">Notes maintenance</span>
            <textarea className="control-chrome min-h-[52px]" value={maintenanceNotes} onChange={(e) => setMaintenanceNotes(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-foreground-muted">Observation terrain</span>
            <textarea className="control-chrome min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button type="button" className="border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground" onClick={() => submitLog().catch(console.error)}>
            Enregistrer
          </button>
        </div>
      </Modal>
    </div>
  );
}
