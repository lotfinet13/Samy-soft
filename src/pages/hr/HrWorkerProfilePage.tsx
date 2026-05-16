import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";

type WorkerDto = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  jobTitle: string | null;
  department: string | null;
  hireDate: string | null;
  salaryType: "MONTHLY" | "DAILY";
  baseSalary: string | null;
  dailyWage: string | null;
  overtimeRate: string | null;
  notes: string | null;
  isActive: boolean;
};

const emptyForm: WorkerDto = {
  id: "",
  code: "",
  firstName: "",
  lastName: "",
  phone: "",
  address: "",
  jobTitle: "",
  department: "",
  hireDate: null,
  salaryType: "MONTHLY",
  baseSalary: "",
  dailyWage: "",
  overtimeRate: "",
  notes: "",
  isActive: true,
};

export function HrWorkerProfilePage() {
  const { workerId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const isCreate = workerId === "nouveau";
  const [form, setForm] = useState<WorkerDto>(emptyForm);
  const [loading, setLoading] = useState(!isCreate);
  const [error, setError] = useState<string | null>(null);
  const [payroll, setPayroll] = useState<
    Array<{
      id: string;
      periodStart: string;
      periodEnd: string;
      grossAmount: string;
      netAmount: string;
      status: string;
    }>
  >([]);
  const [activity, setActivity] = useState<
    Array<{ id: string; action: string; createdAt: string; user: { displayName: string } | null }>
  >([]);

  useEffect(() => {
    if (isCreate || !workerId) {
      setForm(emptyForm);
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await samyInvoke<{
          worker: WorkerDto;
          payrollRecords: Array<{
            id: string;
            periodStart: string;
            periodEnd: string;
            grossAmount: string;
            netAmount: string;
            status: string;
          }>;
          activity: Array<{ id: string; action: string; createdAt: string; user: { displayName: string } | null }>;
        }>(IPC_CHANNELS.HR_WORKER_GET, workerId);
        setForm({
          ...res.worker,
          phone: res.worker.phone ?? "",
          address: res.worker.address ?? "",
          jobTitle: res.worker.jobTitle ?? "",
          department: res.worker.department ?? "",
          notes: res.worker.notes ?? "",
          baseSalary: res.worker.baseSalary ?? "",
          dailyWage: res.worker.dailyWage ?? "",
          overtimeRate: res.worker.overtimeRate ?? "",
        });
        setPayroll(res.payrollRecords);
        setActivity(res.activity);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [workerId, isCreate]);

  if (!can(PERMISSIONS.HR_READ)) return <Navigate to="/" replace />;

  async function handleSave(): Promise<void> {
    if (!can(PERMISSIONS.HR_WRITE)) return;
    setError(null);
    try {
      await samyInvoke(IPC_CHANNELS.HR_WORKER_UPSERT, {
        id: isCreate ? undefined : form.id,
        code: form.code,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || null,
        address: form.address || null,
        jobTitle: form.jobTitle || null,
        department: form.department || null,
        hireDate: form.hireDate || null,
        salaryType: form.salaryType,
        baseSalary: form.baseSalary || undefined,
        dailyWage: form.dailyWage || undefined,
        overtimeRate: form.overtimeRate || undefined,
        notes: form.notes || null,
        isActive: form.isActive,
      });
      if (isCreate) {
        navigate("/rh/effectifs");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return <p className="text-[12px] text-foreground-muted">Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={isCreate ? "Nouvel employé" : `Employé ${form.code}`}
        subtitle="Profil contractuel, grille salaire, historique paie et journal RH."
      />

      {error ? (
        <p className="rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[12px] text-danger">{error}</p>
      ) : null}

      <section className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-3">
        <h2 className="mb-2 text-[12px] font-bold uppercase text-foreground-muted">Identité & contrat</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-0.5 text-[11px]">
            Code employé *
            <input
              className="erp-input h-8 text-[12px]"
              value={form.code}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]">
            Nom *
            <input
              className="erp-input h-8 text-[12px]"
              value={form.lastName}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]">
            Prénom *
            <input
              className="erp-input h-8 text-[12px]"
              value={form.firstName}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]">
            Téléphone
            <input
              className="erp-input h-8 text-[12px]"
              value={form.phone ?? ""}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]">
            Département
            <input
              className="erp-input h-8 text-[12px]"
              value={form.department ?? ""}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]">
            Poste / fonction
            <input
              className="erp-input h-8 text-[12px]"
              value={form.jobTitle ?? ""}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] sm:col-span-2">
            Adresse
            <input
              className="erp-input h-8 text-[12px]"
              value={form.address ?? ""}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]">
            Date embauche
            <input
              type="date"
              className="erp-input h-8 text-[12px]"
              value={form.hireDate?.slice(0, 10) ?? ""}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  hireDate: e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null,
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]">
            Type salaire
            <select
              className="erp-input h-8 text-[12px]"
              value={form.salaryType}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              onChange={(e) => setForm((f) => ({ ...f, salaryType: e.target.value as WorkerDto["salaryType"] }))}
            >
              <option value="MONTHLY">Mensuel</option>
              <option value="DAILY">Journalier</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]">
            Salaire de base (DZD)
            <input
              className="erp-input h-8 font-mono text-[12px]"
              value={form.baseSalary ?? ""}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              placeholder="0"
              onChange={(e) => setForm((f) => ({ ...f, baseSalary: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]">
            Salaire journalier (DZD)
            <input
              className="erp-input h-8 font-mono text-[12px]"
              value={form.dailyWage ?? ""}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              placeholder="0"
              onChange={(e) => setForm((f) => ({ ...f, dailyWage: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]">
            Tarif HS / h (DZD)
            <input
              className="erp-input h-8 font-mono text-[12px]"
              value={form.overtimeRate ?? ""}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              placeholder="0"
              onChange={(e) => setForm((f) => ({ ...f, overtimeRate: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={form.isActive}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Actif
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] sm:col-span-3">
            Notes internes
            <textarea
              className="erp-input min-h-[52px] text-[12px]"
              value={form.notes ?? ""}
              disabled={!can(PERMISSIONS.HR_WRITE)}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
        </div>
        {can(PERMISSIONS.HR_WRITE) ? (
          <div className="mt-3 flex justify-end">
            <button type="button" className="rounded bg-accent px-3 py-1.5 text-[12px] font-semibold text-background" onClick={() => void handleSave()}>
              Enregistrer
            </button>
          </div>
        ) : null}
      </section>

      {!isCreate ? (
        <>
          <section className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-3">
            <h2 className="mb-2 text-[12px] font-bold uppercase text-foreground-muted">Historique paie (extraits)</h2>
            {payroll.length ? (
              <table className="w-full border-collapse text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-border text-[10px] font-semibold uppercase text-foreground-muted">
                    <th className="py-1">Période</th>
                    <th className="py-1 text-right">Brut</th>
                    <th className="py-1 text-right">Net</th>
                    <th className="py-1">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.map((p) => (
                    <tr key={p.id} className="border-b border-border/70">
                      <td className="py-1 font-mono text-[10px]">
                        {p.periodStart.slice(0, 10)} → {p.periodEnd.slice(0, 10)}
                      </td>
                      <td className="py-1 text-right font-mono">{p.grossAmount}</td>
                      <td className="py-1 text-right font-mono">{p.netAmount}</td>
                      <td className="py-1">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[12px] text-foreground-muted">Aucune fiche paie encore calculée.</p>
            )}
          </section>

          <section className="rounded-[var(--erp-radius-panel)] border border-border bg-surface p-3">
            <h2 className="mb-2 text-[12px] font-bold uppercase text-foreground-muted">Journal RH (extrait)</h2>
            {activity.length ? (
              <table className="w-full border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-border text-[10px] font-semibold uppercase text-foreground-muted">
                    <th className="py-1">Date</th>
                    <th className="py-1">Action</th>
                    <th className="py-1">Utilisateur</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a) => (
                    <tr key={a.id} className="border-b border-border/70">
                      <td className="py-1 font-mono text-[10px]">{new Date(a.createdAt).toLocaleString()}</td>
                      <td className="py-1">{a.action}</td>
                      <td className="py-1">{a.user?.displayName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[12px] text-foreground-muted">Pas d&apos;entrées.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
