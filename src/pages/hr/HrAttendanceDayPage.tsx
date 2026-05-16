import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { ATTENDANCE_STATUS_OPTIONS } from "@/pages/hr/hr-labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

type Matrix = {
  date: string;
  workers: Array<{ id: string; code: string; firstName: string; lastName: string }>;
  records: Array<{
    id: string;
    workerId: string;
    status: string;
    overtimeHours: string;
    notes: string | null;
  } | null>;
};

type RowState = {
  id?: string;
  workerId: string;
  status: string;
  overtimeHours: string;
  notes: string;
};

const ATT_VIRTUAL_THRESHOLD = 16;
const ATT_ROW_HEIGHT = 38;

function AttendanceWorkerTable(props: {
  matrix: Matrix;
  rows: RowState[];
  setRows: Dispatch<SetStateAction<RowState[]>>;
  canWrite: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { workers } = props.matrix;
  const virtualize = workers.length >= ATT_VIRTUAL_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: workers.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ATT_ROW_HEIGHT,
    overscan: 10,
  });

  const headerRow = (
    <tr className="flex w-full min-w-[760px] border-b border-border bg-surface-muted/50 text-[10px] font-semibold uppercase text-foreground-muted">
      <th className="w-14 flex-none px-1 py-1 text-left">Code</th>
      <th className="min-w-0 flex-[1.2] px-1 py-1 text-left">Nom</th>
      <th className="w-[148px] flex-none px-1 py-1 text-left">Statut</th>
      <th className="w-16 flex-none px-1 py-1 text-left">HS (h)</th>
      <th className="min-w-[120px] flex-1 px-1 py-1 text-left">Notes</th>
    </tr>
  );

  function renderCells(w: Matrix["workers"][number], idx: number) {
    return (
      <>
        <td className="w-14 flex-none px-1 py-0.5 font-mono text-[10px]">{w.code}</td>
        <td className="min-w-0 flex-[1.2] px-1 py-0.5">
          {w.lastName} {w.firstName}
        </td>
        <td className="w-[148px] flex-none px-1 py-0.5">
          <select
            className="erp-input h-7 w-full max-w-[140px] py-0 text-[11px]"
            disabled={!props.canWrite}
            value={props.rows[idx]?.status ?? "PRESENT"}
            onChange={(e) => {
              const v = e.target.value;
              props.setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, status: v } : x)));
            }}
          >
            {ATTENDANCE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </td>
        <td className="w-16 flex-none px-1 py-0.5">
          <input
            className="erp-input h-7 w-16 font-mono text-[11px]"
            disabled={!props.canWrite}
            value={props.rows[idx]?.overtimeHours ?? "0"}
            onChange={(e) => {
              const v = e.target.value;
              props.setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, overtimeHours: v } : x)));
            }}
          />
        </td>
        <td className="min-w-[120px] flex-1 px-1 py-0.5">
          <input
            className="erp-input h-7 w-full min-w-[120px] text-[11px]"
            disabled={!props.canWrite}
            value={props.rows[idx]?.notes ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              props.setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, notes: v } : x)));
            }}
          />
        </td>
      </>
    );
  }

  if (!virtualize) {
    return (
      <div className="overflow-x-auto rounded-[var(--erp-radius-panel)] border border-border bg-surface">
        <table className="w-full min-w-[760px] border-collapse text-left text-[11.5px]">
          <thead>{headerRow}</thead>
          <tbody>
            {workers.map((w, idx) => (
              <tr key={w.id} className="flex w-full min-w-[760px] border-b border-border/70">
                {renderCells(w, idx)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const vItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      role="region"
      aria-label="Grille présence — flèches pour défiler"
      className="max-h-[min(72vh,620px)] overflow-auto overflow-x-auto rounded-[var(--erp-radius-panel)] border border-border bg-surface outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-accent))]"
    >
      <table className="w-full min-w-[760px] border-collapse text-left text-[11.5px]" style={{ display: "block" }}>
        <thead className="sticky top-0 z-[2] block bg-surface-muted/50 shadow-[0_1px_0_rgb(var(--color-border))]">
          {headerRow}
        </thead>
        <tbody
          className="relative block"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {vItems.map((vr) => {
            const w = workers[vr.index];
            if (!w) return null;
            return (
              <tr
                key={w.id}
                className="flex w-full min-w-[760px] border-b border-border/70 bg-surface"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: `${vr.size}px`,
                  transform: `translateY(${vr.start}px)`,
                }}
              >
                {renderCells(w, vr.index)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HrAttendanceDayPage() {
  const { can } = usePermissions();
  const todayLocal = new Date();
  const defaultDate = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, "0")}-${String(todayLocal.getDate()).padStart(2, "0")}`;
  const [dateStr, setDateStr] = useState(defaultDate);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await samyInvoke<Matrix>(IPC_CHANNELS.HR_ATTENDANCE_DAY_MATRIX, { date: dateStr });
      setMatrix(res);
      setRows(
        res.workers.map((w, i) => {
          const r = res.records[i];
          return {
            id: r?.id,
            workerId: w.id,
            status: r?.status ?? "PRESENT",
            overtimeHours: r?.overtimeHours ?? "0",
            notes: r?.notes ?? "",
          };
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [dateStr]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!can(PERMISSIONS.HR_READ)) return <Navigate to="/" replace />;

  async function saveBulk(): Promise<void> {
    if (!can(PERMISSIONS.HR_WRITE)) return;
    setBusy(true);
    setError(null);
    try {
      await samyInvoke(IPC_CHANNELS.HR_ATTENDANCE_BULK_UPSERT, {
        items: rows.map((r) => ({
          id: r.id,
          workerId: r.workerId,
          workedDate: dateStr,
          status: r.status,
          overtimeHours: r.overtimeHours,
          notes: r.notes || null,
        })),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Présence — saisie journalière"
        subtitle="Grille dense : Tab entre lignes, validation groupe — anti-doublon date × employé."
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5 text-[11px]">
          Date pointage
          <input
            type="date"
            className="erp-input h-8 text-[12px]"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </label>
        {can(PERMISSIONS.HR_WRITE) ? (
          <button
            type="button"
            disabled={busy}
            className="h-8 rounded bg-accent px-3 text-[12px] font-semibold text-background disabled:opacity-50"
            onClick={() => void saveBulk()}
          >
            {busy ? "…" : "Enregistrer tout"}
          </button>
        ) : null}
        <span className="text-[11px] text-foreground-muted">{matrix?.workers.length ?? 0} employés actifs</span>
      </div>

      {error ? (
        <p className="rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[12px] text-danger">{error}</p>
      ) : null}

      {matrix ? (
        <AttendanceWorkerTable
          matrix={matrix}
          rows={rows}
          setRows={setRows}
          canWrite={can(PERMISSIONS.HR_WRITE)}
        />
      ) : null}
    </div>
  );
}
