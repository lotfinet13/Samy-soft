import { APP_SETTING_KEYS } from "../../shared/settings-keys.js";
import { getPrisma } from "../database.js";
import { appendSamyMainLog } from "./logger-service.js";
import { exportDatabaseBackup } from "./backup-service.js";
import { logActivity } from "./activity-service.js";

let started = false;

export function setupBackupScheduler(): void {
  if (started) return;
  started = true;
  const tickMs = 5 * 60 * 1000;

  const tick = async (): Promise<void> => {
    try {
      const prisma = getPrisma();
      const rows = await prisma.appSetting.findMany({
        where: {
          key: {
            in: [
              APP_SETTING_KEYS.BACKUP_AUTO_ENABLED,
              APP_SETTING_KEYS.BACKUP_AUTO_INTERVAL_HOURS,
            ],
          },
        },
      });
      const map = new Map(rows.map((r) => [r.key, r.value]));
      if (map.get(APP_SETTING_KEYS.BACKUP_AUTO_ENABLED) !== "true") return;

      const hoursRaw = Number.parseInt(
        map.get(APP_SETTING_KEYS.BACKUP_AUTO_INTERVAL_HOURS) ?? "24",
        10,
      );
      const hours = Number.isFinite(hoursRaw) && hoursRaw >= 1 ? Math.min(hoursRaw, 168) : 24;
      const intervalMs = hours * 3600_000;

      const last = await prisma.backupRecord.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      const now = Date.now();
      const lastMs = last?.createdAt?.getTime() ?? 0;
      if (now - lastMs < intervalMs - 120_000) return;

      const created = await exportDatabaseBackup(prisma, undefined);

      await logActivity(prisma, {
        action: "BACKUP_AUTO",
        entityType: "backup_record",
        entityId: created.recordId,
        metadata: {
          automatic: true,
          filename: created.filename,
        },
      });

      await appendSamyMainLog("Sauvegarde automatique créée.", {
        recordId: created.recordId,
        filename: created.filename,
      });
    } catch (error: unknown) {
      await appendSamyMainLog("Échec sauvegarde automatique.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  setInterval(() => void tick(), tickMs);
  void tick();
}
