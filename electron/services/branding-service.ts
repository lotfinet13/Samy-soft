import type { PrismaClient } from "@prisma/client";
import { APP_SETTING_KEYS, DEFAULT_SETTINGS } from "../../shared/settings-keys.js";

export async function readPublicBranding(prisma: PrismaClient): Promise<{
  factoryName: string;
  currencyCode: string;
  theme: string;
}> {
  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          APP_SETTING_KEYS.FACTORY_NAME,
          APP_SETTING_KEYS.CURRENCY_CODE,
          APP_SETTING_KEYS.THEME,
        ],
      },
    },
  });

  const map = Object.fromEntries(rows.map((row) => [row.key, row.value])) as Partial<
    Record<(typeof APP_SETTING_KEYS)[keyof typeof APP_SETTING_KEYS], string>
  >;

  return {
    factoryName: map[APP_SETTING_KEYS.FACTORY_NAME] ?? DEFAULT_SETTINGS[APP_SETTING_KEYS.FACTORY_NAME],
    currencyCode:
      map[APP_SETTING_KEYS.CURRENCY_CODE] ?? DEFAULT_SETTINGS[APP_SETTING_KEYS.CURRENCY_CODE],
    theme: map[APP_SETTING_KEYS.THEME] ?? DEFAULT_SETTINGS[APP_SETTING_KEYS.THEME],
  };
}
