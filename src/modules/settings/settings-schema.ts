import { z } from "zod";
import { APP_SETTING_KEYS } from "@shared/settings-keys";

export const settingsFormSchema = z.object({
  [APP_SETTING_KEYS.FACTORY_NAME]: z.string().min(2, "Nom d’usine trop court"),
  [APP_SETTING_KEYS.CURRENCY_CODE]: z.string().min(3, "Code devise invalide").max(8),
  [APP_SETTING_KEYS.THEME]: z.enum(["light", "dark", "system"]),
  [APP_SETTING_KEYS.BACKUP_DIRECTORY]: z.string(),
  [APP_SETTING_KEYS.BACKUP_AUTO_ENABLED]: z.enum(["true", "false"]),
  [APP_SETTING_KEYS.BACKUP_AUTO_INTERVAL_HOURS]: z
    .string()
    .regex(/^[0-9]+$/, "Nombre d’heures invalide"),
  [APP_SETTING_KEYS.BACKUP_RETENTION_MAX]: z
    .string()
    .regex(/^[0-9]+$/, "Nombre d’archives invalide"),
  [APP_SETTING_KEYS.SESSION_IDLE_MINUTES]: z
    .string()
    .regex(/^[0-9]{1,3}$/, "Délai d’expiration session invalide (0 = désactivé)"),
  [APP_SETTING_KEYS.SESSION_LOCK_REQUIRED]: z.enum(["true", "false"]),
  [APP_SETTING_KEYS.EXPORT_CSV_DECIMALS]: z.enum(["0", "1", "2", "3", "4"]),
  [APP_SETTING_KEYS.PRINTER_DEFAULT_NAME]: z.string(),
  [APP_SETTING_KEYS.PRINTER_PAPER_SIZE]: z.enum(["A4", "A5"]),
  [APP_SETTING_KEYS.PRINTER_ORIENTATION]: z.enum(["portrait", "landscape"]),
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;
