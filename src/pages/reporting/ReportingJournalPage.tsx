import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import type { ColumnDef } from "@tanstack/react-table";
import { ActivitySquare, Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Navigate } from "react-router-dom";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { useOperationalFilters } from "@/hooks/useOperationalFilters";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadTextFile } from "@/lib/text-download";
import { samyInvoke } from "@/lib/samy";
import { useToastStore } from "@/stores/toast-store";
import type { ActivityLogDTO } from "@/types/ipc";

type QueryResponse = { rows: ActivityLogDTO[]; total: number; hasMore: boolean };

export function ReportingJournalPage(): ReactElement {
  const { can } = usePermissions();
  const pushToast = useToastStore((t) => t.push);
  const [rows, setRows] = useState<ActivityLogDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const { chips, pushRecent, savePreset, removePreset } = useOperationalFilters("reporting-audit-search");
  const [auditPresetName, setAuditPresetName] = useState("");

  const load = useCallback(
    async (nextOffset = 0, append = false): Promise<void> => {
      if (!can(PERMISSIONS.ACTIVITY_READ)) return;
      setLoading(true);
      try {
        const res = await samyInvoke<QueryResponse>(IPC_CHANNELS.ACTIVITY_QUERY, {
          offset: nextOffset,
          take: 100,
          fromIso: from.trim() ? from : undefined,
          toIso: to.trim() ? to : undefined,
          search: search.trim() ? search.trim() : undefined,
        });
        setTotal(res.total);
        setHasMore(res.hasMore);
        setRows((prev) => (append ? [...prev, ...res.rows] : res.rows));
      } catch (error: unknown) {
        pushToast("error", error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    },
    [can, from, pushToast, search, to],
  );

  useEffect(() => {
    void load(0, false);
  }, [can, load]);

  const columns = useMemo<ColumnDef<ActivityLogDTO>[]>(
    () => [
      {
        header: "Horodatage",
        accessorKey: "createdAt",
        cell: ({ row }) =>
          new Intl.DateTimeFormat("fr-DZ", {
            dateStyle: "short",
            timeStyle: "medium",
          }).format(new Date(row.original.createdAt)),
      },
      { header: "Utilisateur", accessorFn: (r) => r.user?.displayName ?? r.user?.username ?? "—" },
      { header: "Action", accessorKey: "action" },
      {
        header: "Entité",
        accessorFn: (r) => `${r.entityType}${r.entityId ? ` · ${r.entityId}` : ""}`,
      },
    ],
    [],
  );

  async function exportCsv(): Promise<void> {
    try {
      const csv = await samyInvoke<{ content: string; filenameSuggested: string }>(
        IPC_CHANNELS.ACTIVITY_EXPORT_CSV,
        {
          fromIso: from.trim() ? from : undefined,
          toIso: to.trim() ? to : undefined,
          search: search.trim() ? search.trim() : undefined,
          exportLimit: 4000,
        },
      );
      downloadTextFile({
        content: csv.content,
        filenameSuggested: csv.filenameSuggested,
        mimeType: "text/csv;charset=utf-8",
      });
      pushToast("success", "Export CSV généré.");
    } catch (error: unknown) {
      pushToast("error", error instanceof Error ? error.message : String(error));
    }
  }

  if (!can(PERMISSIONS.ACTIVITY_READ)) return <Navigate to="/rapports" replace />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Centre d’audit opérationnel"
        subtitle="Journal local chiffré opérationnel · export CSV pour archivage légal interne."
      />
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <ActivitySquare className="h-6 w-6 text-accent" strokeWidth={2.25} />
          <span className="text-sm font-semibold text-foreground">Filtres & export</span>
          <label className="flex items-center gap-2 text-[11px] font-semibold text-foreground-muted">
            Début
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="erp-input h-8" />
          </label>
          <label className="flex items-center gap-2 text-[11px] font-semibold text-foreground-muted">
            Fin
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="erp-input h-8" />
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[11px] font-semibold text-foreground-muted">
            Recherche
            <input
              value={search}
              placeholder="Action, type d’entité, identifiant…"
              className="erp-input h-8 font-mono"
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => void load(0, false)}
              onKeyDown={(e) => e.key === "Enter" && void load(0, false)}
            />
          </label>
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-[11px] font-semibold"
            onClick={() => {
              if (search.trim().length >= 2) pushRecent(search.trim());
              void load(0, false);
            }}
            disabled={loading}
          >
            Appliquer
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded border border-accent bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-foreground"
            onClick={() => void exportCsv()}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <span className="text-[11px] text-foreground-muted">
            {loading ? " chargement…" : null} résultats {rows.length}/{total.toLocaleString("fr-DZ")}
          </span>
          <input
            className="erp-input h-8 w-36 px-2 font-mono text-[11px]"
            placeholder="Nom filtre"
            value={auditPresetName}
            onChange={(e) => setAuditPresetName(e.target.value)}
          />
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-[11px] font-semibold"
            onClick={() => savePreset(auditPresetName.trim() || search.trim() || "audit", search)}
          >
            Mémoriser
          </button>
        </div>
        {chips.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[11px]">
            <span className="font-semibold text-foreground-muted">Recherches :</span>
            {chips.map((c) => (
              <span key={`${c.kind}-${c.label}`} className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  className="rounded-full border border-border bg-surface-muted px-2 py-0.5 font-semibold hover:bg-surface"
                  onClick={() => {
                    setSearch(c.query);
                    queueMicrotask(() => void load(0, false));
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
      </section>
      <DataTable columns={columns} data={rows} emptyLabel="Aucune trace pour ces critères." />
      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loading}
            className="rounded border border-border px-6 py-2 text-xs font-semibold"
            onClick={() => void load(rows.length, true)}
          >
            Charger la suite ({rows.length}/{total})
          </button>
        </div>
      ) : null}
    </div>
  );
}
