import { APP_SETTING_KEYS } from "@shared/settings-keys";
import { useEffect } from "react";
import { applyThemeClass } from "@/stores/settings-store";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";

export function ThemeSync() {
  const settings = useSettingsStore((state) => state.settings);
  const brandingTheme = useAuthStore((state) => state.branding?.theme);

  useEffect(() => {
    const theme =
      settings?.[APP_SETTING_KEYS.THEME] ?? brandingTheme ?? DEFAULT_THEME_FALLBACK;

    applyThemeClass(theme);

    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyThemeClass("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings?.[APP_SETTING_KEYS.THEME], brandingTheme]);

  return null;
}

const DEFAULT_THEME_FALLBACK = "system";
