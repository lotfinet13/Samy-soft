/**
 * Clés normalisées pour AppSetting — éviter les chaînes magiques dans les modules.
 */
export const APP_SETTING_KEYS = {
  FACTORY_NAME: "factory.name",
  CURRENCY_CODE: "app.currency",
  THEME: "ui.theme",
  BACKUP_DIRECTORY: "backup.directory",
  BACKUP_AUTO_ENABLED: "backup.auto.enabled",
  BACKUP_AUTO_INTERVAL_HOURS: "backup.auto.interval_hours",
  BACKUP_RETENTION_MAX: "backup.retention.max_archives",
  SESSION_IDLE_MINUTES: "session.idle.minutes",
  SESSION_LOCK_REQUIRED: "session.lock.required",
  EXPORT_CSV_DECIMALS: "export.csv.decimals",
  PRINTER_DEFAULT_NAME: "printer.default_name",
  PRINTER_PAPER_SIZE: "printer.paper_size",
  PRINTER_ORIENTATION: "printer.orientation",
  /** Première installation : assistant usine (admin seulement) jusqu’à « Terminer ». */
  ONBOARDING_WIZARD_DONE: "onboarding.wizard_done",
} as const;

export type AppSettingKey =
  (typeof APP_SETTING_KEYS)[keyof typeof APP_SETTING_KEYS];

export const DEFAULT_SETTINGS: Record<AppSettingKey, string> = {
  [APP_SETTING_KEYS.FACTORY_NAME]: "SAMY SOFT — Glacerie",
  [APP_SETTING_KEYS.CURRENCY_CODE]: "DZD",
  [APP_SETTING_KEYS.THEME]: "system",
  [APP_SETTING_KEYS.BACKUP_DIRECTORY]: "",
  [APP_SETTING_KEYS.BACKUP_AUTO_ENABLED]: "false",
  [APP_SETTING_KEYS.BACKUP_AUTO_INTERVAL_HOURS]: "24",
  [APP_SETTING_KEYS.BACKUP_RETENTION_MAX]: "30",
  [APP_SETTING_KEYS.SESSION_IDLE_MINUTES]: "0",
  [APP_SETTING_KEYS.SESSION_LOCK_REQUIRED]: "false",
  [APP_SETTING_KEYS.EXPORT_CSV_DECIMALS]: "2",
  [APP_SETTING_KEYS.PRINTER_DEFAULT_NAME]: "",
  [APP_SETTING_KEYS.PRINTER_PAPER_SIZE]: "A4",
  [APP_SETTING_KEYS.PRINTER_ORIENTATION]: "portrait",
  [APP_SETTING_KEYS.ONBOARDING_WIZARD_DONE]: "false",
};
