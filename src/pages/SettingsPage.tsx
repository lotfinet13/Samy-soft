import { zodResolver } from "@hookform/resolvers/zod";
import { IPC_CHANNELS } from "@shared/ipc-channels";
import { APP_SETTING_KEYS, type AppSettingKey } from "@shared/settings-keys";
import { PERMISSIONS } from "@shared/permissions";
import type { ColumnDef } from "@tanstack/react-table";
import { FolderOpen, HardDriveDownload, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { refreshSettingsSilently } from "@/lib/bootstrap";
import { cn } from "@/lib/cn";
import { samyInvoke } from "@/lib/samy";
import {
  settingsFormSchema,
  type SettingsFormValues,
} from "@/modules/settings/settings-schema";
import { useAuthStore } from "@/stores/auth-store";
import type { BackupRecordDTO } from "@/types/ipc";

type BackupFolderResponse =
  | { canceled: true }
  | { canceled: false; path: string };

export function SettingsPage() {
  const { can } = usePermissions();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupRecordDTO[]>([]);
  const [busyBackup, setBusyBackup] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecordDTO | null>(null);
  const [backupHealth, setBackupHealth] = useState<{
    lastBackupAt: string | null;
    lastIntegrityStatus: string | null;
    warningStale: boolean;
  } | null>(null);
  const [maintSummary, setMaintSummary] = useState<unknown | null>(null);
  const [maintBusy, setMaintBusy] = useState(false);
  const [integrityReport, setIntegrityReport] = useState<{
    checkedAt: string;
    ok: boolean;
    findings: Array<{
      severity: "error" | "warning";
      code: string;
      message: string;
      count?: number;
      sampleIds?: string[];
    }>;
  } | null>(null);
  const [integrityBusy, setIntegrityBusy] = useState(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
  });

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const settings = await samyInvoke<SettingsFormValues>(
          IPC_CHANNELS.SETTINGS_GET_ALL,
        );
        if (!mounted) return;
        form.reset(settings);
      } catch {
        if (!mounted) return;
        setStatusMessage("Impossible de charger les paramètres (droits insuffisants).");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await samyInvoke<BackupRecordDTO[]>(IPC_CHANNELS.BACKUP_LIST);
        setBackups(rows);
      } catch {
        setBackups([]);
      }
    })();
  }, [busyBackup]);

  useEffect(() => {
    if (!can(PERMISSIONS.SETTINGS_READ)) return;
    void (async () => {
      try {
        const h = await samyInvoke<{
          lastBackupAt: string | null;
          lastIntegrityStatus: string | null;
          warningStale: boolean;
        }>(IPC_CHANNELS.BACKUP_HEALTH);
        setBackupHealth(h);
      } catch {
        setBackupHealth(null);
      }
    })();
  }, [busyBackup, can]);

  async function verifyBackupRecord(id: string): Promise<void> {
    setBusyBackup(true);
    try {
      await samyInvoke(IPC_CHANNELS.BACKUP_VERIFY, { backupId: id });
      const rows = await samyInvoke<BackupRecordDTO[]>(IPC_CHANNELS.BACKUP_LIST);
      setBackups(rows);
      window.alert("Contrôle d’intégrité terminé : archive valide.");
    } catch (error: unknown) {
      window.alert(error instanceof Error ? error.message : "Échec vérification.");
    } finally {
      setBusyBackup(false);
    }
  }

  async function loadMaintSummary(): Promise<void> {
    if (!can(PERMISSIONS.SETTINGS_READ)) return;
    setMaintBusy(true);
    try {
      const s = await samyInvoke<Record<string, unknown>>(IPC_CHANNELS.DB_MAINT_SUMMARY);
      setMaintSummary(s);
    } catch (error: unknown) {
      window.alert(error instanceof Error ? error.message : "Maintenance indisponible.");
    } finally {
      setMaintBusy(false);
    }
  }

  async function runBusinessIntegrityScan(): Promise<void> {
    if (!can(PERMISSIONS.SETTINGS_READ)) return;
    setIntegrityBusy(true);
    try {
      const r = await samyInvoke<NonNullable<typeof integrityReport>>(IPC_CHANNELS.DB_DATA_INTEGRITY_SCAN);
      setIntegrityReport(r);
      if (r.ok) {
        window.alert("Cohérence métier : aucun écart détecté.");
      } else {
        window.alert(
          `Cohérence métier : ${r.findings.length} écart(s). Détail ci‑dessous — consulter l’équipe technique.`,
        );
      }
    } catch (error: unknown) {
      window.alert(error instanceof Error ? error.message : "Analyse indisponible.");
    } finally {
      setIntegrityBusy(false);
    }
  }

  async function vacuumDb(): Promise<void> {
    if (!can(PERMISSIONS.SETTINGS_WRITE)) return;
    if (!window.confirm("VACUUM compacte SQLite et peut prendre une minute.\nContinuer ?")) return;
    setMaintBusy(true);
    try {
      await samyInvoke(IPC_CHANNELS.DB_MAINT_VACUUM);
      await loadMaintSummary();
      window.alert("VACUUM terminé.");
    } catch (error: unknown) {
      window.alert(error instanceof Error ? error.message : "Échec VACUUM.");
    } finally {
      setMaintBusy(false);
    }
  }

  const backupColumns = useMemo<ColumnDef<BackupRecordDTO>[]>(
    () => [
      {
        header: "Date",
        accessorKey: "createdAt",
        cell: ({ row }) =>
          new Intl.DateTimeFormat("fr-DZ", {
            dateStyle: "short",
            timeStyle: "medium",
          }).format(new Date(row.original.createdAt)),
      },
      {
        header: "Fichier",
        accessorKey: "filename",
      },
      {
        header: "Taille (Mo)",
        accessorKey: "sizeBytes",
        cell: ({ row }) => (row.original.sizeBytes / (1024 * 1024)).toFixed(2),
      },
      {
        header: "Format",
        accessorKey: "format",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.format ?? "—"}</span>
        ),
      },
      {
        header: "Intégrité",
        id: "integrity",
        accessorFn: (r) =>
          `${r.integrityStatus ?? "—"}${r.verifiedAt ? ` (${new Intl.DateTimeFormat("fr-DZ").format(new Date(r.verifiedAt))})` : ""}`,
      },
      {
        header: "Empreinte",
        accessorKey: "checksumSha256",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-foreground-muted">
            {row.original.checksumSha256 ? row.original.checksumSha256.slice(0, 12) + "…" : "—"}
          </span>
        ),
      },
      {
        header: "Contrôles",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyBackup || !row.original.filename.toLowerCase().endsWith(".zip")}
              className="rounded border border-border px-3 py-1 text-xs font-semibold disabled:opacity-40"
              onClick={() => void verifyBackupRecord(row.original.id)}
            >
              Vérifier ZIP
            </button>
            <button
              type="button"
              className="rounded border border-border bg-surface-muted px-3 py-1 text-xs font-semibold"
              onClick={() => setRestoreTarget(row.original)}
            >
              Restaurer
            </button>
          </div>
        ),
      },
    ],
    [busyBackup],
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Paramètres"
        subtitle="Configuration locale de l’usine, sauvegardes SQLite et préférences d’impression."
        actions={
          can(PERMISSIONS.SETTINGS_READ) ? (
            <Link
              to="/diagnostics"
              className="focus-ring inline-flex min-h-touch items-center rounded-xl border border-border bg-surface-muted px-4 text-sm font-semibold text-foreground hover:bg-surface"
            >
              Centre diagnostic
            </Link>
          ) : null
        }
      />

      {backupHealth?.warningStale ? (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-foreground">
          Attention : ancienne sauvegarde locale détectée — planifiez un export ZIP immédiatement.
        </div>
      ) : null}

      {statusMessage ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm font-semibold text-foreground">
          {statusMessage}
        </div>
      ) : null}

      <form
        className="grid gap-10 lg:grid-cols-2"
        onSubmit={form.handleSubmit(async (values) => {
          setStatusMessage(null);
          await samyInvoke(IPC_CHANNELS.SETTINGS_UPSERT, values as Record<string, string>);
          await refreshSettingsSilently();
          setStatusMessage("Paramètres enregistrés.");
        })}
      >
        <section className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-foreground">Identité de l’usine</h2>
          <div className="mt-6 space-y-6">
            <FormField
              label="Nom de l’usine"
              error={form.formState.errors[APP_SETTING_KEYS.FACTORY_NAME]?.message}
            >
              <input
                className={cn(
                  "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                )}
                {...form.register(APP_SETTING_KEYS.FACTORY_NAME)}
              />
            </FormField>

            <FormField
              label="Devise (code ISO)"
              description="Exemple : DZD, EUR…"
              error={form.formState.errors[APP_SETTING_KEYS.CURRENCY_CODE]?.message}
            >
              <input
                className={cn(
                  "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none uppercase",
                )}
                {...form.register(APP_SETTING_KEYS.CURRENCY_CODE)}
              />
            </FormField>

            <FormField label="Thème" error={form.formState.errors[APP_SETTING_KEYS.THEME]?.message}>
              <select
                className={cn(
                  "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                )}
                {...form.register(APP_SETTING_KEYS.THEME)}
              >
                <option value="system">Système</option>
                <option value="light">Clair</option>
                <option value="dark">Sombre</option>
              </select>
            </FormField>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-foreground">Sauvegardes SQLite</h2>
          <p className="mt-2 text-sm text-foreground-muted">
            Archives ZIP (SQLite + manifeste SHA-256). Les entrées anciennes au format fichier{" "}
            <span className="font-mono">.sqlite</span> restent supportées pour compatibilité.
          </p>

          <div className="mt-6 space-y-6">
            <FormField
              label="Dossier de sauvegarde"
              description="Chemin local hors-base — accessible même hors ligne."
              error={form.formState.errors[APP_SETTING_KEYS.BACKUP_DIRECTORY]?.message}
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  readOnly
                  className={cn(
                    "focus-ring min-h-touch w-full flex-1 rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                  )}
                  {...form.register(APP_SETTING_KEYS.BACKUP_DIRECTORY)}
                />
                <button
                  type="button"
                  className="focus-ring inline-flex min-h-touch items-center justify-center gap-2 rounded-xl border border-border bg-surface-muted px-5 text-base font-semibold text-foreground hover:bg-surface"
                  onClick={() => {
                    void (async () => {
                      const picked = await samyInvoke<BackupFolderResponse>(
                        IPC_CHANNELS.SETTINGS_SELECT_BACKUP_FOLDER,
                      );
                      if (!picked.canceled) {
                        const setStringField = form.setValue as (
                          name: AppSettingKey,
                          value: string,
                          opts?: { shouldDirty?: boolean; shouldValidate?: boolean },
                        ) => void;
                        setStringField(APP_SETTING_KEYS.BACKUP_DIRECTORY, picked.path, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }
                    })();
                  }}
                >
                  <FolderOpen className="h-5 w-5" strokeWidth={2.25} />
                  Choisir
                </button>
              </div>
            </FormField>

            <div className="grid gap-6 lg:grid-cols-3">
              <FormField
                label="Sauvegarde automatique"
                error={form.formState.errors[APP_SETTING_KEYS.BACKUP_AUTO_ENABLED]?.message}
              >
                <select
                  className={cn(
                    "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                  )}
                  {...form.register(APP_SETTING_KEYS.BACKUP_AUTO_ENABLED)}
                >
                  <option value="false">Désactivée</option>
                  <option value="true">Activée</option>
                </select>
              </FormField>

              <FormField
                label="Intervalle (heures)"
                error={
                  form.formState.errors[APP_SETTING_KEYS.BACKUP_AUTO_INTERVAL_HOURS]?.message
                }
              >
                <input
                  inputMode="numeric"
                  className={cn(
                    "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                  )}
                  {...form.register(APP_SETTING_KEYS.BACKUP_AUTO_INTERVAL_HOURS)}
                />
              </FormField>

              <FormField
                label="Nombre max d’archives conservées"
                description="Au-delà, les anciens fichiers sont retirés (rotation)."
                error={form.formState.errors[APP_SETTING_KEYS.BACKUP_RETENTION_MAX]?.message}
              >
                <input
                  inputMode="numeric"
                  className={cn(
                    "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                  )}
                  {...form.register(APP_SETTING_KEYS.BACKUP_RETENTION_MAX)}
                />
              </FormField>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <FormField
                label="Expiration session (minutes)"
                description="0 = désactivé. Idle appliqué uniquement après chargement réussi des réglages."
                error={form.formState.errors[APP_SETTING_KEYS.SESSION_IDLE_MINUTES]?.message}
              >
                <input
                  inputMode="numeric"
                  className={cn(
                    "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                  )}
                  {...form.register(APP_SETTING_KEYS.SESSION_IDLE_MINUTES)}
                />
              </FormField>

              <FormField
                label="Verrouillage inactivité"
                error={form.formState.errors[APP_SETTING_KEYS.SESSION_LOCK_REQUIRED]?.message}
              >
                <select
                  className={cn(
                    "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                  )}
                  {...form.register(APP_SETTING_KEYS.SESSION_LOCK_REQUIRED)}
                >
                  <option value="false">Désactivé (logout auto)</option>
                  <option value="true">Verrouillage + ré-auth</option>
                </select>
              </FormField>

              <FormField
                label="Décimaux export CSV rapports"
                error={form.formState.errors[APP_SETTING_KEYS.EXPORT_CSV_DECIMALS]?.message}
              >
                <select
                  className={cn(
                    "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                  )}
                  {...form.register(APP_SETTING_KEYS.EXPORT_CSV_DECIMALS)}
                >
                  <option value="0">0</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </FormField>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="focus-ring inline-flex min-h-touch items-center justify-center gap-2 rounded-xl bg-accent px-5 text-base font-semibold text-accent-foreground hover:opacity-95 disabled:opacity-60"
                disabled={busyBackup}
                onClick={() => {
                  void (async () => {
                    try {
                      setBusyBackup(true);
                      const created = await samyInvoke<{
                        filename: string;
                        absolutePath: string;
                      }>(IPC_CHANNELS.BACKUP_EXPORT);
                      window.alert(`Sauvegarde créée : ${created.filename}`);
                      const rows = await samyInvoke<BackupRecordDTO[]>(
                        IPC_CHANNELS.BACKUP_LIST,
                      );
                      setBackups(rows);
                    } catch (error) {
                      window.alert(
                        error instanceof Error ? error.message : "Échec export sauvegarde.",
                      );
                    } finally {
                      setBusyBackup(false);
                    }
                  })();
                }}
              >
                <HardDriveDownload className="h-5 w-5" strokeWidth={2.25} />
                Exporter maintenant
              </button>
              <button
                type="submit"
                className="focus-ring inline-flex min-h-touch items-center justify-center rounded-xl border border-border bg-surface-muted px-5 text-base font-semibold text-foreground hover:bg-surface disabled:opacity-60"
                disabled={form.formState.isSubmitting}
              >
                Enregistrer les paramètres
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Historique des sauvegardes</h2>
              <p className="mt-2 text-sm text-foreground-muted">
                Restauration destructive — vérifiez l’empreinte manifeste depuis « Vérifier ZIP » puis
                relancez l’ERP après remplacement fichier.
              </p>
            </div>
            <button
              type="button"
              className="focus-ring inline-flex min-h-touch items-center justify-center gap-2 rounded-xl border border-border bg-surface-muted px-5 text-base font-semibold text-foreground hover:bg-surface"
              onClick={() => {
                void (async () => {
                  try {
                    const rows = await samyInvoke<BackupRecordDTO[]>(
                      IPC_CHANNELS.BACKUP_LIST,
                    );
                    setBackups(rows);
                  } catch {
                    setBackups([]);
                  }
                })();
              }}
            >
              <RotateCcw className="h-5 w-5" strokeWidth={2.25} />
              Rafraîchir la liste
            </button>
          </div>

          <div className="mt-6">
            <DataTable data={backups} columns={backupColumns} emptyLabel="Aucune sauvegarde." />
          </div>
        </section>

        {can(PERMISSIONS.SETTINGS_READ) ? (
          <section className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm lg:col-span-2">
            <h2 className="text-xl font-semibold text-foreground">Maintenance SQLite & migrations</h2>
            <p className="mt-2 max-w-prose text-sm text-foreground-muted">
              Diagnostics embarqués (PRAGMA) · liste des anomalies de références étrangères et état du
              schéma Prisma sans connectivité réseau.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="focus-ring rounded-xl border border-border bg-surface-muted px-5 py-2 text-sm font-semibold"
                disabled={maintBusy}
                onClick={() => void loadMaintSummary()}
              >
                Charger le diagnostic
              </button>
              <button
                type="button"
                className="focus-ring rounded-xl border border-border bg-surface-muted px-5 py-2 text-sm font-semibold"
                disabled={integrityBusy}
                onClick={() => void runBusinessIntegrityScan()}
                title="Stocks, factures, paie, lots — lecture seule"
              >
                Scanner cohérence métier
              </button>
              {can(PERMISSIONS.SETTINGS_WRITE) ? (
                <button
                  type="button"
                  className="focus-ring rounded-xl border border-border bg-surface-muted px-5 py-2 text-sm font-semibold"
                  disabled={maintBusy}
                  onClick={() => void vacuumDb()}
                >
                  VACUUM (compactage)
                </button>
              ) : null}
            </div>
            {integrityReport ? (
              <div
                className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                  integrityReport.ok
                    ? "border-emerald-500/40 bg-emerald-500/5 text-foreground"
                    : "border-amber-500/50 bg-amber-500/5 text-foreground"
                }`}
              >
                <div className="font-semibold">
                  Dernier contrôle métier ·{" "}
                  {new Intl.DateTimeFormat("fr-DZ", {
                    dateStyle: "short",
                    timeStyle: "medium",
                  }).format(new Date(integrityReport.checkedAt))}
                </div>
                {integrityReport.findings.length === 0 ? (
                  <p className="mt-2 text-foreground-muted">Aucun écart signalé.</p>
                ) : (
                  <ul className="mt-3 list-inside list-disc space-y-2 text-[13px] leading-snug">
                    {integrityReport.findings.map((f) => (
                      <li key={f.code}>
                        <span className="font-mono text-[11px] text-foreground-muted">{f.code}</span>{" "}
                        — {f.message}
                        {typeof f.count === "number" ? ` (${f.count})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            {maintSummary && typeof maintSummary === "object" ? (
              <div className="mt-6 max-h-72 overflow-auto rounded-xl border border-border bg-surface p-4 font-mono text-[11px] leading-relaxed text-foreground-muted">
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(maintSummary, null, 2).slice(0, 9000)}
                </pre>
              </div>
            ) : (
              <p className="mt-4 text-sm text-foreground-muted">
                Lancez « Charger le diagnostic » pour afficher intégrité, PRAGMA, migrations et lignes des
                tables métier critiques.
              </p>
            )}
          </section>
        ) : null}

        <section className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm lg:col-span-2">
          <h2 className="text-xl font-semibold text-foreground">Imprimante</h2>
          <p className="mt-2 text-sm text-foreground-muted">
            Paramètres libres pour harmoniser les impressions atelier / bureau (Phase 2 — rendu
            réel).
          </p>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <FormField
              label="Nom d’imprimante par défaut"
              error={form.formState.errors[APP_SETTING_KEYS.PRINTER_DEFAULT_NAME]?.message}
            >
              <input
                className={cn(
                  "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                )}
                {...form.register(APP_SETTING_KEYS.PRINTER_DEFAULT_NAME)}
              />
            </FormField>

            <FormField
              label="Format papier"
              error={form.formState.errors[APP_SETTING_KEYS.PRINTER_PAPER_SIZE]?.message}
            >
              <select
                className={cn(
                  "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                )}
                {...form.register(APP_SETTING_KEYS.PRINTER_PAPER_SIZE)}
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
              </select>
            </FormField>

            <FormField
              label="Orientation"
              error={form.formState.errors[APP_SETTING_KEYS.PRINTER_ORIENTATION]?.message}
            >
              <select
                className={cn(
                  "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none",
                )}
                {...form.register(APP_SETTING_KEYS.PRINTER_ORIENTATION)}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Paysage</option>
              </select>
            </FormField>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="submit"
              className="focus-ring inline-flex min-h-touch items-center justify-center rounded-xl bg-accent px-6 text-base font-semibold text-accent-foreground hover:opacity-95 disabled:opacity-60"
              disabled={form.formState.isSubmitting}
            >
              Enregistrer tout
            </button>
          </div>
        </section>
      </form>

      <ConfirmDialog
        open={restoreTarget !== null}
        title="Restaurer la base locale ?"
        description={
          restoreTarget
            ? `Cette opération remplace la base locale par :

${restoreTarget.absolutePath}

• Les archives ZIP passent automatiquement par un contrôle manifeste avant remplacement.

Les utilisateurs connectés devront se reconnecter après rechargement.`
            : ""
        }
        confirmLabel="Restaurer maintenant"
        tone="danger"
        busy={busyBackup}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={() => {
          if (!restoreTarget) return;
          void (async () => {
            try {
              setBusyBackup(true);
              await samyInvoke(IPC_CHANNELS.BACKUP_RESTORE, {
                backupId: restoreTarget.id,
              });
              useAuthStore.getState().setUser(null);
              useAuthStore.getState().setBranding(null);
              window.location.hash = "#/login";
              window.location.reload();
            } catch (error) {
              window.alert(error instanceof Error ? error.message : "Échec restauration.");
            } finally {
              setBusyBackup(false);
              setRestoreTarget(null);
            }
          })();
        }}
      />
    </div>
  );
}
