import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

function monthBounds(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const last = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export function HrAttendanceCalendarPage() {
  const { can } = usePermissions();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [counts, setCounts] = useState<Record<string, { total: number; absent: number }>>({});
  const [error, setError] = useState<string | null>(null);

  const { from, to } = useMemo(() => monthBounds(year, month), [year, month]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await samyInvoke<{ items: Array<{ workedDate: string; status: string }> }>(
          IPC_CHANNELS.HR_ATTENDANCE_LIST,
          { from, to },
        );
        const map: Record<string, { total: number; absent: number }> = {};
        for (const row of res.items) {
          const key = row.workedDate.slice(0, 10);
          if (!map[key]) map[key] = { total: 0, absent: 0 };
          map[key].total += 1;
          if (row.status === "ABSENT") map[key].absent += 1;
        }
        setCounts(map);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [from, to]);

  if (!can(PERMISSIONS.HR_READ)) return <Navigate to="/" replace />;

  function goPrev(): void {
    setMonth((m) => {
      if (m === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }

  function goNext(): void {
    setMonth((m) => {
      if (m === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }

  const days: number[] = [];
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= lastDay; d++) days.push(d);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Calendrier présences" subtitle="Synthèse mensuelle — lignes pointées et absences signalées." />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="erp-input h-8 px-2 text-[11px]" onClick={goPrev}>
          ◀
        </button>
        <button type="button" className="erp-input h-8 px-2 text-[11px]" onClick={goNext}>
          ▶
        </button>
        <span className="text-[12px] font-semibold">
          {year}-{String(month + 1).padStart(2, "0")}
        </span>
      </div>

      {error ? (
        <p className="rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[12px] text-danger">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-[var(--erp-radius-panel)] border border-border bg-surface">
        <table className="w-full border-collapse text-center text-[11px]">
          <thead>
            <tr className="border-b border-border text-[10px] font-semibold uppercase text-foreground-muted">
              <th className="px-1 py-1">Jour</th>
              <th className="px-1 py-1">Lignes</th>
              <th className="px-1 py-1">Absences</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const c = counts[key];
              return (
                <tr key={key} className="border-b border-border/70">
                  <td className="py-1 font-mono">{key}</td>
                  <td className="py-1">{c?.total ?? 0}</td>
                  <td className="py-1 text-danger">{c?.absent ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
