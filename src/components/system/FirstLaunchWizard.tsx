import { IPC_CHANNELS } from "@shared/ipc-channels";
import { APP_SETTING_KEYS as KEYS } from "@shared/settings-keys";
import { PERMISSIONS } from "@shared/permissions";
import { ChevronRight, Factory, HardDrive, Printer, Shield } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { refreshSettingsSilently } from "@/lib/bootstrap";
import { samyInvoke } from "@/lib/samy";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { SettingsFormValues } from "@/modules/settings/settings-schema";

const STEPS = ["Usine", "Sauvegardes", "Imprimante", "Sécurité"] as const;

export function FirstLaunchWizard(): ReactElement | null {
  const user = useAuthStore((s) => s.user);
  const settings = useSettingsStore((s) => s.settings);
  const { can } = usePermissions();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [factoryName, setFactoryName] = useState("");
  const [backupDir, setBackupDir] = useState("");
  const [printerName, setPrinterName] = useState("");
  const [sessionIdle, setSessionIdle] = useState("0");
  const [lockRequired, setLockRequired] = useState(false);

  const shouldOffer =
    user?.role.name === "ADMIN" &&
    !!settings &&
    settings[KEYS.ONBOARDING_WIZARD_DONE] !== "true" &&
    can(PERMISSIONS.SETTINGS_WRITE);

  useEffect(() => {
    if (!settings || !shouldOffer) return;
    setFactoryName(settings[KEYS.FACTORY_NAME] ?? "");
    setBackupDir(settings[KEYS.BACKUP_DIRECTORY] ?? "");
    setPrinterName(settings[KEYS.PRINTER_DEFAULT_NAME] ?? "");
    setSessionIdle(settings[KEYS.SESSION_IDLE_MINUTES] || "0");
    setLockRequired(settings[KEYS.SESSION_LOCK_REQUIRED] === "true");
  }, [settings, shouldOffer]);

  if (!shouldOffer || !open) return null;

  async function pickBackupFolder(): Promise<void> {
    try {
      const res = await samyInvoke<{ canceled: true } | { canceled: false; path: string }>(
        IPC_CHANNELS.SETTINGS_SELECT_BACKUP_FOLDER,
      );
      if ("canceled" in res && !res.canceled) setBackupDir(res.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dossier non choisi.");
    }
  }

  async function finish(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const patch: Partial<Record<(typeof KEYS)[keyof typeof KEYS], string>> = {
        [KEYS.FACTORY_NAME]: factoryName.trim() || settings?.[KEYS.FACTORY_NAME] || "SAMY SOFT",
        [KEYS.BACKUP_DIRECTORY]: backupDir,
        [KEYS.PRINTER_DEFAULT_NAME]: printerName,
        [KEYS.SESSION_IDLE_MINUTES]: sessionIdle.replace(/\D/g, "").slice(0, 3) || "0",
        [KEYS.SESSION_LOCK_REQUIRED]: lockRequired ? "true" : "false",
        [KEYS.ONBOARDING_WIZARD_DONE]: "true",
      };
      await samyInvoke<SettingsFormValues>(IPC_CHANNELS.SETTINGS_UPSERT, patch as Record<string, string>);
      await refreshSettingsSilently();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/55 px-4 py-10">
      <div
        className="flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface-elevated shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Assistant première installation"
      >
        <header className="border-b border-border px-5 py-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-foreground-muted">
            Première installation — poste industriel
          </div>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Configuration minimale</h2>
          <p className="mt-2 text-[13px] leading-snug text-foreground-muted">
            Quelques réglages sécurisent l’exploitation quotidienne. Vous pourrez tout modifier dans{" "}
            <span className="font-semibold text-foreground">Paramètres</span>.
          </p>
          <ol className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-foreground-muted">
            {STEPS.map((label, i) => (
              <li
                key={label}
                className={
                  i === step
                    ? "rounded-full bg-surface-muted px-2 py-0.5 text-foreground ring-1 ring-border-strong"
                    : ""
                }
              >
                {i + 1}. {label}
              </li>
            ))}
          </ol>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              {error}
            </p>
          ) : null}

          {step === 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Factory className="h-4 w-4 text-accent" aria-hidden />
                Identité usine
              </div>
              <label className="block text-[11px] font-semibold text-foreground-muted">
                Nom affiché (topbar, documents)
                <input
                  className="erp-input mt-1 w-full text-[13px]"
                  value={factoryName}
                  onChange={(e) => setFactoryName(e.target.value)}
                  autoFocus
                />
              </label>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <HardDrive className="h-4 w-4 text-accent" aria-hidden />
                Sauvegardes ZIP
              </div>
              <p className="text-[12px] text-foreground-muted">
                Choisissez un dossier local dédié aux archives SQLite (rotation selon Paramètres).
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="focus-ring rounded-xl border border-border bg-surface-muted px-4 py-2 text-[12px] font-semibold"
                  onClick={() => void pickBackupFolder()}
                >
                  Parcourir…
                </button>
                <span className="min-w-0 truncate font-mono text-[11px] text-foreground-muted">
                  {backupDir || "—"}
                </span>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Printer className="h-4 w-4 text-accent" aria-hidden />
                Impression atelier
              </div>
              <label className="block text-[11px] font-semibold text-foreground-muted">
                Nom imprimante par défaut (facultatif)
                <input
                  className="erp-input mt-1 w-full text-[13px]"
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                />
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Shield className="h-4 w-4 text-accent" aria-hidden />
                Session poste partagé
              </div>
              <label className="block text-[11px] font-semibold text-foreground-muted">
                Inactivité avant déconnexion / verrou (minutes, 0 = désactivé)
                <input
                  className="erp-input mt-1 w-24 font-mono text-[13px]"
                  inputMode="numeric"
                  value={sessionIdle}
                  onChange={(e) => setSessionIdle(e.target.value)}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
                <input
                  type="checkbox"
                  checked={lockRequired}
                  onChange={(e) => setLockRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Exiger un verrou écran (overlay) plutôt que déconnexion seule
              </label>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          {step > 0 ? (
            <button
              type="button"
              className="focus-ring rounded-xl border border-border bg-surface-muted px-4 py-2 text-[12px] font-semibold"
              disabled={busy}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Retour
            </button>
          ) : (
            <button
              type="button"
              className="focus-ring rounded-xl border border-border px-4 py-2 text-[12px] font-semibold text-foreground-muted hover:bg-surface-muted"
              disabled={busy}
              onClick={() => void finish()}
            >
              Ignorer pour l’instant
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="focus-ring inline-flex items-center gap-1 rounded-xl bg-accent px-4 py-2 text-[12px] font-semibold text-background"
              disabled={busy}
              onClick={() => setStep((s) => s + 1)}
            >
              Suivant <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="focus-ring inline-flex items-center gap-1 rounded-xl bg-accent px-4 py-2 text-[12px] font-semibold text-background disabled:opacity-50"
              disabled={busy}
              onClick={() => void finish()}
            >
              Terminer
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
