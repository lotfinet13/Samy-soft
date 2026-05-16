import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

type ShiftRow = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  assignments: Array<{ workerId: string; worker: { id: string; code: string; firstName: string; lastName: string } }>;
};

type WorkerBrief = { id: string; code: string; firstName: string; lastName: string };

export function HrShiftsPage() {
  const { can } = usePermissions();
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [workers, setWorkers] = useState<WorkerBrief[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ id: "", name: "", startTime: "06:00", endTime: "14:00" });
  const [selectedShift, setSelectedShift] = useState<string | null>(null);
  const [assign, setAssign] = useState<Set<string>>(new Set());

  async function refresh(): Promise<void> {
    try {
      const [sRes, wRes] = await Promise.all([
        samyInvoke<{ items: ShiftRow[] }>(IPC_CHANNELS.HR_SHIFT_LIST),
        samyInvoke<{ items: WorkerBrief[] }>(IPC_CHANNELS.HR_WORKER_LIST, { take: 400 }),
      ]);
      setShifts(sRes.items);
      setWorkers(wRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!selectedShift) return;
    const sh = shifts.find((s) => s.id === selectedShift);
    const ids = new Set(sh?.assignments.map((a) => a.workerId) ?? []);
    setAssign(ids);
  }, [selectedShift, shifts]);

  if (!can(PERMISSIONS.HR_READ)) return <Navigate to="/" replace />;

  async function saveShift(): Promise<void> {
    if (!can(PERMISSIONS.HR_WRITE)) return;
    setError(null);
    try {
      await samyInvoke(IPC_CHANNELS.HR_SHIFT_UPSERT, {
        id: form.id || undefined,
        name: form.name,
        startTime: form.startTime,
        endTime: form.endTime,
      });
      setForm({ id: "", name: "", startTime: "06:00", endTime: "14:00" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pushAssign(): Promise<void> {
    if (!selectedShift || !can(PERMISSIONS.HR_WRITE)) return;
    await samyInvoke(IPC_CHANNELS.HR_SHIFT_ASSIGN, {
      shiftId: selectedShift,
      workerIds: [...assign],
    });
    await refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Équipes & shifts" subtitle="Plages horaires, rattachements — base pour futures rotations 3×8." />

      {error ? (
        <p className="rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[12px] text-danger">{error}</p>
      ) : null}

      <section className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-3">
        <h2 className="mb-2 text-[12px] font-bold uppercase text-foreground-muted">Créer / modifier shift</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="erp-input h-8 text-[12px]"
            placeholder="Nom shift"
            disabled={!can(PERMISSIONS.HR_WRITE)}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="erp-input h-8 w-20 font-mono text-[12px]"
            disabled={!can(PERMISSIONS.HR_WRITE)}
            value={form.startTime}
            onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
          />
          <input
            className="erp-input h-8 w-20 font-mono text-[12px]"
            disabled={!can(PERMISSIONS.HR_WRITE)}
            value={form.endTime}
            onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
          />
          {can(PERMISSIONS.HR_WRITE) ? (
            <button type="button" className="h-8 rounded bg-accent px-2 text-[12px] font-semibold text-background" onClick={() => void saveShift()}>
              Enregistrer shift
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[10px] text-foreground-muted">Édition : sélectionnez une ligne ci-dessous pour pré-remplir l&apos;ID interne via console — ou créez toujours nouveau.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-2">
          <h3 className="mb-2 text-[11px] font-bold uppercase text-foreground-muted">Shifts</h3>
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-border text-[10px] text-foreground-muted">
                <th className="py-1">Nom</th>
                <th className="py-1">Début</th>
                <th className="py-1">Fin</th>
                <th className="py-1">Act.</th>
                <th className="py-1 text-right">Gérer</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-b border-border/70">
                  <td className="py-1 font-semibold">{s.name}</td>
                  <td className="py-1 font-mono">{s.startTime}</td>
                  <td className="py-1 font-mono">{s.endTime}</td>
                  <td className="py-1">{s.isActive ? "oui" : "non"}</td>
                  <td className="py-1 text-right">
                    <button type="button" className="text-accent hover:underline" onClick={() => setSelectedShift(s.id)}>
                      Affecter
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-2">
          <h3 className="mb-2 text-[11px] font-bold uppercase text-foreground-muted">
            Affectations {selectedShift ? `(shift sélectionné)` : ""}
          </h3>
          {!selectedShift ? (
            <p className="text-[12px] text-foreground-muted">Choisissez « Affecter » sur un shift.</p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto text-[11px]">
              {workers.map((w) => (
                <label key={w.id} className="flex cursor-pointer items-center gap-2 border-b border-border/60 py-1">
                  <input
                    type="checkbox"
                    disabled={!can(PERMISSIONS.HR_WRITE)}
                    checked={assign.has(w.id)}
                    onChange={(e) => {
                      const next = new Set(assign);
                      if (e.target.checked) next.add(w.id);
                      else next.delete(w.id);
                      setAssign(next);
                    }}
                  />
                  <span className="font-mono text-[10px]">{w.code}</span>
                  <span>
                    {w.lastName} {w.firstName}
                  </span>
                </label>
              ))}
              {can(PERMISSIONS.HR_WRITE) ? (
                <button
                  type="button"
                  className="mt-2 w-full rounded border border-accent py-1 text-[11px] font-semibold text-accent"
                  onClick={() => void pushAssign()}
                >
                  Appliquer affectations
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
