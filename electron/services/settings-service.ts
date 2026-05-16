import type { PrismaClient } from "@prisma/client";
import {
  APP_SETTING_KEYS,
  DEFAULT_SETTINGS,
  type AppSettingKey,
} from "../../shared/settings-keys.js";

export async function getAllSettings(
  prisma: PrismaClient,
): Promise<Record<AppSettingKey, string>> {
  const rows = await prisma.appSetting.findMany();
  const base: Record<AppSettingKey, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    const key = row.key;
    if (isAppSettingKey(key)) {
      base[key] = row.value;
    }
  }
  return base;
}

export async function upsertSettings(
  prisma: PrismaClient,
  entries: Partial<Record<AppSettingKey, string>>,
): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    if (!isAppSettingKey(key)) continue;
    if (typeof value !== "string") continue;
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

export function isAppSettingKey(key: string): key is AppSettingKey {
  return (Object.values(APP_SETTING_KEYS) as string[]).includes(key);
}

export { APP_SETTING_KEYS };
